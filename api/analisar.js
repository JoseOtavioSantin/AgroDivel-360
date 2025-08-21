// /api/analisar.js
import formidable from "formidable";
import * as XLSX from "xlsx";
import OpenAI from "openai";
import fs from "node:fs";
import * as ss from "simple-statistics";
import dayjs from "dayjs";

export const config = { api: { bodyParser: false } };

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

const isPercentLike = (arr) => {
  const a = arr.filter((v) => Number.isFinite(v));
  if (!a.length) return false;
  const inRange = a.filter((v) => v >= 0 && v <= 120).length / a.length;
  return inRange >= 0.8; // maioria entre 0 e ~120
};

// classifica coluna por semântica aproximada
function semanticType(h) {
  const n = norm(h);
  if (n.includes("carga") && n.includes("motor")) return "carga";
  if (n.includes("carga")) return "carga";
  if (n.includes("combust") || n.includes("consumo") || n.includes("km/l")) return "consumo";
  if (n.includes("desliz") || n.includes("patin")) return "desliz";
  if (n.includes("vel") || n.includes("km/h")) return "velocidade";
  if (n.includes("rpm")) return "rpm";
  if (n.includes("temp")) return "temperatura";
  if (n.includes("press")) return "pressao";
  return "generico";
}

function emojiForType(t) {
  switch (t) {
    case "carga": return "🔧";
    case "consumo": return "⛽";
    case "desliz": return "🛞";
    case "velocidade": return "🚜";
    case "rpm": return "⚙️";
    case "temperatura": return "🌡️";
    case "pressao": return "🧯";
    default: return "📈";
  }
}

// monta faixas para “%/carga”
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
  return {
    raw: bands,
    pretty: `<20%=${pct(bands["<20%"])}, 20–60%=${pct(bands["20–60%"])}, 60–80%=${pct(bands["60–80%"])}, >80%=${pct(bands[">80%"])}`
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Método não permitido" });

  const form = formidable({ multiples: false, keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    try {
      if (err) {
        console.error("Upload parse error:", err);
        return res.status(400).json({ ok: false, error: "Erro no upload" });
      }

      const cliente = String(fields.cliente || "N/D");
      const modelo  = String(fields.modelo  || "N/D");

      const f = firstFileFrom(files);
      const filePath = f?.filepath;
      if (!filePath) return res.status(400).json({ ok: false, error: "Arquivo .xlsx não recebido" });

      // Lê Excel
      const buffer = fs.readFileSync(filePath);
      const wb = XLSX.read(buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
      if (!rows.length) return res.status(400).json({ ok: false, error: "Planilha vazia" });

      const headers = Object.keys(rows[0] ?? {});
      // converte todas as colunas numéricas
      const numericCols = headers
        .map((h) => {
          const vals = rows.map((r) => toNum(r[h])).filter((v) => v !== null);
          const isNumeric = vals.length >= Math.min(10, Math.ceil(rows.length * 0.1)); // tem números suficientes?
          return isNumeric ? { header: h, values: vals } : null;
        })
        .filter(Boolean);

      // período (se houver colunas de tempo)
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

      // monta seções dinâmicas
      const totalFrames = rows.length;
      const sections = [];
      let ociosidadePct = null; // se detectarmos "velocidade", calculamos % de zero

      // ordenar: primeiro colunas reconhecidas (carga, consumo, desliz, velocidade), depois demais
      const score = (h) => {
        const t = semanticType(h);
        return ({
          carga: 0, consumo: 1, desliz: 2, velocidade: 3,
          rpm: 4, temperatura: 5, pressao: 6, generico: 7
        }[t] ?? 99);
      };
      numericCols.sort((a, b) => score(a.header) - score(b.header));

      for (const { header, values } of numericCols) {
        const t = semanticType(header);
        const stats = describe(values);
        if (!stats) continue;

        const fmt = (x, u = "") => (x != null ? Number(x).toFixed(2) + u : "N/D");
        const bullets = [
          `Média: ${fmt(stats.mean)}${t === "velocidade" ? " km/h" : t === "consumo" ? " km/L" : t === "desliz" || isPercentLike(values) || t==="carga" ? "%" : ""}.`,
          `Quartis (Q1–Q3): ${fmt(stats.q1)} – ${fmt(stats.q3)}.`,
          `Mín–Máx: ${fmt(stats.min)} – ${fmt(stats.max)}.`
        ];

        // % de zeros (útil para velocidade → ociosidade)
        const zeros = values.filter((v) => v === 0).length;
        if (zeros > 0) {
          const zPct = percent(zeros, values.length);
          bullets.push(`Valores zero: ${zPct.toFixed(1)}% dos registros.`);
          if (t === "velocidade") ociosidadePct = zPct;
        }

        // se “%/carga” → faixas
        if (t === "carga" || t === "desliz" || isPercentLike(values)) {
          const bands = cargaBands(values);
          bullets.push(`Distribuição por faixas: ${bands.pretty}.`);
        }

        // recomendações rápidas por tipo
        if (t === "carga") {
          bullets.push(
            "📌 Sugestões: manter operação na faixa de torque (60–80% de carga); revisar dimensionamento de implementos se <20% recorrente."
          );
        } else if (t === "consumo") {
          bullets.push(
            "📌 Sugestões: reduzir marcha lenta; trabalhar próximo da faixa de torque; conferir pressão/lastro e regulagens de implemento."
          );
        } else if (t === "desliz") {
          bullets.push(
            "📌 Sugestões: ajustar lastro e pressão dos pneus; evitar velocidade acima da tração disponível; alvo típico 10–12% em tração."
          );
        } else if (t === "velocidade") {
          bullets.push(
            "📌 Sugestões: alinhar velocidade à operação/implemento; padronizar deslocamento vs trabalho; reduzir paradas desnecessárias."
          );
        }

        sections.push({
          title: `${emojiForType(t)} ${header}`,
          bullets
        });
      }

      // “Resumo e próximas ações” com agregados simples (dinâmico)
      if (sections.length) {
        const items = [];
        if (ociosidadePct != null) items.push(`Ociosidade (vel=0): ${ociosidadePct.toFixed(1)}% — foco em reduzir marcha lenta/paradas.`);
        // heurísticas adicionais:
        const cargaSec = sections.find((s) => s.title.startsWith("🔧"));
        if (cargaSec) items.push("Aumentar tempo na faixa de carga 60–80% para ganhar eficiência.");
        const deslizSec = sections.find((s) => s.title.startsWith("🛞"));
        if (deslizSec) items.push("Conter picos de patinagem com ajustes de lastro/pressão e técnica de operação.");
        const consumoSec = sections.find((s) => s.title.startsWith("⛽"));
        if (consumoSec) items.push("Investigar consumo em cenários de baixa carga e marcha lenta.");

        sections.push({
          title: "📌 Resumo de Melhorias e Próximas Ações",
          bullets: items.length ? items : [
            "Padronizar faixas de operação por tarefa e treinar operadores.",
            "Revisar calibragem/lastro e dimensionamento de implementos.",
            "Reduzir ociosidade e marcha lenta sem demanda."
          ]
        });
      }

      // análise longa com os NOMES EXATOS das colunas
      let analise = "";
      try {
        if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY ausente");
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const preferredCols = headers; // manda todas as colunas, o modelo usa as relevantes
        const sample = rows.slice(0, 150).map((r) => {
          const o = {};
          for (const k of preferredCols) o[k] = r[k];
          return o;
        });

        const prompt = `
Você é especialista em telemetria agrícola. Gere um relatório textual detalhado e didático para o equipamento "${modelo}" (cliente: "${cliente}").
Use os **nomes exatos das colunas** do dataset como títulos das seções (apenas para as colunas realmente relevantes e numéricas).
Para cada coluna escolhida: descreva média, Q1–Q3, min–máx, eventos críticos (ex.: zeros, picos). Evite gráficos. 
Finalize com um bloco "Resumo de Melhorias e Próximas Ações" sintetizando os principais ajustes operacionais.

Dataset (amostra até 150 linhas, com nomes originais das colunas):
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
          totalFrames
        },
        sections,     // lista dinâmica (títulos = NOME ORIGINAL DA COLUNA)
        analysis: analise
      });
    } catch (e) {
      console.error("Erro interno:", e);
      return res.status(500).json({ ok: false, error: "Erro interno na análise." });
    }
  });
}
