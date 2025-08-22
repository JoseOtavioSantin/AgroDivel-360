// /api/analisar.js
import formidable from "formidable";
import * as XLSX from "xlsx";
import OpenAI from "openai";
import fs from "node:fs";
import * as ss from "simple-statistics";
import dayjs from "dayjs";

export const config = { api: { bodyParser: false, sizeLimit: "25mb" } };

// ---------- Helpers ----------
const toNum = (v) => {
  const n = typeof v === "string" ? v.replace(",", ".") : v;
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
};

const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const firstFileFrom = (files) => {
  if (!files) return null;
  if (files.relatorio) return Array.isArray(files.relatorio) ? files.relatorio[0] : files.relatorio;
  const keys = Object.keys(files);
  if (!keys.length) return null;
  const any = files[keys[0]];
  return Array.isArray(any) ? any[0] : any;
};

const percent = (num, den) => (den > 0 ? (num / den) * 100 : 0);

function describe(arr) {
  const a = arr.filter((v) => Number.isFinite(v));
  if (!a.length) return null;
  a.sort((x, y) => x - y);
  const mean = ss.mean(a);
  const min = a[0];
  const max = a[a.length - 1];
  const q1 = ss.quantileSorted(a, 0.25);
  const q3 = ss.quantileSorted(a, 0.75);
  const med = ss.medianSorted(a);
  const std = a.length > 1 ? ss.standardDeviation(a) : 0;
  return { count: a.length, mean, min, q1, med, q3, max, std };
}

// —— novas regras de semântica/unidades/ignorados
function semanticType(h) {
  const n = norm(h);
  if (n.includes("carga") && n.includes("motor")) return "carga";
  if (n.includes("carga") || n.includes("% carga")) return "carga";
  if (n.includes("combust") || n.includes("consumo") || n.includes("km/l")) return "consumo";
  if (n.includes("desliz") || n.includes("patin") || n.includes("slip")) return "desliz";
  if (n.includes("vel") || n.includes("km/h")) return "velocidade";
  if (n.includes("rpm")) return "rpm";
  if (n.includes("hora") || n.includes("horimetro")) return "horas";
  if (n.includes("press") && n.includes("oleo")) return "pressao_oleo";
  if (n.includes("press")) return "pressao";
  if (n.includes("temp") || n.includes("temper")) return "temperatura";
  if (n.includes("local") || n === "lat" || n === "lon" || n.includes("latitude") || n.includes("longitude")) return "geo";
  if (n.includes("empty") || n.startsWith("unnamed")) return "ignorar";
  return "generico";
}

function unitFor(type, header) {
  if (type === "carga" || type === "desliz") return "%";
  if (type === "consumo") return " km/L";
  if (type === "velocidade") return " km/h";
  if (type === "rpm") return " rpm";
  if (type === "horas") return " h";
  if (type === "pressao" || type === "pressao_oleo") return ""; // unidade varia (kPa/bar) → deixar sem sufixo
  // se o header tiver símbolo de %, respeitar
  if (/%/.test(header)) return "%";
  return "";
}

// descarta colunas que “poluem” o relatório
function shouldIgnore(header, values) {
  const t = semanticType(header);
  if (t === "geo" || t === "ignorar") return true;
  // quase constante e não for um tipo clássico → ignora
  const s = describe(values);
  if (!s) return true;
  const range = (s.max - s.min);
  const isAlmostConst = range === 0 || (s.mean !== 0 && range / Math.abs(s.mean) < 0.002);
  if (isAlmostConst && !["carga","desliz","velocidade","consumo","rpm","horas","pressao","pressao_oleo","temperatura"].includes(t)) {
    return true;
  }
  return false;
}

// só aplicar faixas quando faz sentido (carga/desliz/% explícito)
function shouldShowBands(type, header) {
  return type === "carga" || type === "desliz" || /%/.test(header);
}

function cargaBands(arr) {
  const bands = { "<20%": 0, "20–60%": 0, "60–80%": 0, ">80%": 0 };
  for (const v of arr) {
    if (!Number.isFinite(v)) continue;
    if (v < 20) bands["<20%"]++;
    else if (v < 60) bands["20–60%"]++;
    else if (v < 80) bands["60–80%"]++;
    else bands[">80%"]++;
  }
  const total = arr.filter((v) => Number.isFinite(v)).length || 1;
  const pct = (n) => percent(n, total).toFixed(1) + "%";
  return `<20%=${pct(bands["<20%"])}, 20–60%=${pct(bands["20–60%"])}, 60–80%=${pct(bands["60–80%"])}, >80%=${pct(bands[">80%"])}`;
}

function emojiFor(type) {
  return ({
    carga: "🔧", consumo: "⛽", desliz: "🛞", velocidade: "🚜",
    rpm: "⚙️", horas: "⏱️", temperatura: "🌡️",
    pressao: "🧯", pressao_oleo: "🧯", generico: "📈"
  }[type] || "📈");
}

// ---------- Handler ----------
export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).json({ ok: true, message: "API analisar ONLINE" });
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Método não permitido" });

  const form = formidable({ multiples: false, keepExtensions: true });
  form.parse(req, async (err, fields, files) => {
    try {
      if (err) return res.status(400).json({ ok: false, error: "Erro no upload" });

      const cliente = String(fields.cliente || "N/D");
      const modelo  = String(fields.modelo  || "N/D");

      const f = firstFileFrom(files);
      const filePath = f?.filepath;
      if (!filePath) return res.status(400).json({ ok: false, error: "Arquivo .xlsx não recebido" });

      const buffer = fs.readFileSync(filePath);
      const wb = XLSX.read(buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
      if (!rows.length) return res.status(400).json({ ok: false, error: "Planilha vazia" });

      const headers = Object.keys(rows[0] ?? {});

      // período (se houver data/hora)
      const timeHeader = headers.find((h) => {
        const n = norm(h);
        return n.includes("carimbo") || n.includes("data") || n.includes("hora") || n.includes("timestamp");
      });
      let inicio = null, fim = null;
      if (timeHeader) {
        const ts = rows
          .map((r) => r[timeHeader])
          .map((t) => (t ? dayjs(String(t)) : null))
          .filter((d) => d && d.isValid())
          .map((d) => d.toDate().getTime())
          .sort((a, b) => a - b);
        if (ts.length) { inicio = new Date(ts[0]); fim = new Date(ts[ts.length - 1]); }
      }

      // monta colunas numéricas válidas
      const numericCols = headers.map((h) => {
        const vals = rows.map((r) => toNum(r[h])).filter((v) => v !== null);
        const enough = vals.length >= Math.min(10, Math.ceil(rows.length * 0.1));
        return enough ? { header: h, values: vals } : null;
      }).filter(Boolean);

      // filtra e ordena por relevância/semântica
      const filtered = numericCols.filter(({ header, values }) => !shouldIgnore(header, values));
      const orderScore = (h) => ({
        carga: 0, consumo: 1, desliz: 2, velocidade: 3,
        rpm: 4, horas: 5, temperatura: 6, pressao_oleo: 7, pressao: 8, generico: 9
      }[semanticType(h)] ?? 99);
      filtered.sort((a, b) => orderScore(a.header) - orderScore(b.header));

      const sections = [];
      let ociosidadePct = null;

      for (const { header, values } of filtered) {
        const type = semanticType(header);
        const u = unitFor(type, header);
        const st = describe(values);
        if (!st) continue;

        const fmt = (x) => (x != null ? Number(x).toFixed(2) + u : "N/D");
        const bullets = [
          `Média: ${fmt(st.mean)}.`,
          `Quartis (Q1–Q3): ${fmt(st.q1)} – ${fmt(st.q3)}.`,
          `Mín–Máx: ${fmt(st.min)} – ${fmt(st.max)}.`
        ];

        // % de zeros (principalmente útil para velocidade → ociosidade)
        const zeros = values.filter((v) => v === 0).length;
        if (zeros > 0) {
          const zPct = percent(zeros, values.length);
          bullets.push(`Valores zero: ${zPct.toFixed(1)}% dos registros.`);
          if (type === "velocidade") ociosidadePct = zPct;
        }

        // bandas somente para carga/desliz ou coluna com símbolo de %
        if (shouldShowBands(type, header)) {
          bullets.push(`Distribuição por faixas: ${cargaBands(values)}`);
        }

        // recomendações por tipo
        if (type === "carga") {
          bullets.push("📌 Sugestões: priorize trabalhar 60–80% de carga; se <20% for recorrente, revise dimensionamento do implemento.");
        } else if (type === "consumo") {
          bullets.push("📌 Sugestões: reduza marcha lenta; opere na faixa de torque; ajuste pressão/lastro e regulagens do implemento.");
        } else if (type === "desliz") {
          bullets.push("📌 Sugestões: ajuste lastro/pressão de pneus; evite velocidade acima da tração; alvo típico 10–12%.");
        } else if (type === "velocidade") {
          bullets.push("📌 Sugestões: alinhe velocidade à tarefa; separe deslocamento de trabalho; reduza paradas improdutivas.");
        }

        sections.push({
          title: `${emojiFor(type)} ${header}`,
          bullets
        });
      }

      // resumo final
      if (sections.length) {
        const items = [];
        if (ociosidadePct != null) items.push(`Ociosidade (vel=0): ${ociosidadePct.toFixed(1)}% — atuar em marcha lenta/paradas.`);
        if (sections.find(s => s.title.startsWith("🔧"))) items.push("Aumentar tempo na faixa de carga 60–80% para melhor eficiência.");
        if (sections.find(s => s.title.startsWith("🛞"))) items.push("Reduzir picos de patinagem com lastro/pressão e técnica de operação.");
        if (sections.find(s => s.title.startsWith("⛽"))) items.push("Investigar consumo alto em baixa carga e marcha lenta.");
        sections.push({ title: "📌 Resumo de Melhorias e Próximas Ações", bullets: items.length ? items : [
          "Padronizar faixas de operação por tarefa e treinar operadores.",
          "Revisar calibragem/lastro e dimensionamento de implementos.",
          "Reduzir ociosidade e marcha lenta sem demanda."
        ]});
      }

      // análise longa (opcional)
      let analise = "";
      try {
        if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY ausente");
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const sample = rows.slice(0, 150).map((r) => {
          const o = {}; for (const k of headers) o[k] = r[k]; return o;
        });
        const prompt = `
Você é especialista em telemetria agrícola. Gere um relatório textual detalhado e didático para o equipamento "${modelo}" (cliente: "${cliente}").
Use os nomes **exatos** das colunas (apenas numéricas e relevantes) como títulos das seções. Para cada coluna: média, Q1–Q3, min–máx, eventos críticos (zeros/picos) e recomendações práticas.
Finalize com "Resumo de Melhorias e Próximas Ações". Evite gráficos.

Amostra (até 150 linhas):
${JSON.stringify(sample)}
`.trim();
        const resp = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.25,
          messages: [{ role: "user", content: prompt }],
        });
        analise = resp?.choices?.[0]?.message?.content?.trim() || "";
      } catch (e) {
        console.error("Falha OpenAI:", e);
      }

      return res.status(200).json({
        ok: true,
        meta: {
          cliente,
          modelo,
          periodo: { inicio: inicio ? inicio.toISOString() : null, fim: fim ? fim.toISOString() : null },
          totalFrames: rows.length
        },
        sections,
        analysis: analise
      });
    } catch (e) {
      console.error("Erro interno:", e);
      return res.status(500).json({ ok: false, error: "Erro interno na análise." });
    }
  });
}
