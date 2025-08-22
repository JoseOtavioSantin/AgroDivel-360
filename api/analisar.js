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
  const std = a.length > 1 ? ss.standardDeviation(a) : 0;
  return { count: a.length, mean, min, max, std };
}

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
  if (type === "pressao" || type === "pressao_oleo") return "";
  if (/%/.test(header)) return "%";
  return "";
}
function shouldIgnore(header, values) {
  const t = semanticType(header);
  if (t === "geo" || t === "ignorar") return true;
  const s = describe(values);
  if (!s) return true;
  const range = (s.max - s.min);
  const isAlmostConst = range === 0 || (s.mean !== 0 && range / Math.abs(s.mean) < 0.002);
  if (isAlmostConst && !["carga","desliz","velocidade","consumo","rpm","horas","pressao","pressao_oleo","temperatura"].includes(t)) {
    return true;
  }
  return false;
}
function shouldShowBands(type, header) {
  return type === "carga" || type === "desliz" || /%/.test(header);
}
function bandsVals(arr) {
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
  return { raw: bands, pretty: `<20%=${pct(bands["<20%"])}, 20–60%=${pct(bands["20–60%"])}, 60–80%=${pct(bands["60–80%"])}, >80%=${pct(bands[">80%"])}` };
}
function consumptionPlausibility(values) {
  const a = values.filter((v) => Number.isFinite(v));
  if (!a.length) return null;
  const high = a.filter(v => v > 5).length;
  const share = percent(high, a.length);
  return share >= 5 ? share : null;
}
function emojiFor(type) {
  return ({
    carga: "🔧", consumo: "⛽", desliz: "🛞", velocidade: "🚜",
    rpm: "⚙️", horas: "⏱️", temperatura: "🌡️",
    pressao: "🧯", pressao_oleo: "🧯", generico: "📈"
  }[type] || "📈");
}

// --------- Mini gráfico (sparkline) ----------
function downsample(values, maxPoints = 120) {
  const a = values.filter((v) => Number.isFinite(v));
  if (a.length <= maxPoints) return a;
  const step = Math.ceil(a.length / maxPoints);
  const out = [];
  for (let i = 0; i < a.length; i += step) out.push(a[i]);
  return out;
}
async function chartPNG(config, w = 280, h = 80) {
  const r = await fetch("https://quickchart.io/chart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chart: config,
      width: w,
      height: h,
      format: "png",
      backgroundColor: "white",
      devicePixelRatio: 2
    }),
  });
  if (!r.ok) throw new Error(`QuickChart ${r.status}`);
  const ab = await r.arrayBuffer();
  return `data:image/png;base64,${Buffer.from(ab).toString("base64")}`;
}
async function sparkline(values) {
  const data = downsample(values, 120);
  const cfg = {
    type: "line",
    data: { labels: data.map(()=>""), datasets: [{ data, borderWidth: 2, pointRadius: 0, fill: false, tension: 0.35 }] },
    options: {
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } }
    }
  };
  return chartPNG(cfg);
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
      // período
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

      // colunas numéricas
      const numericCols = headers.map((h) => {
        const vals = rows.map((r) => toNum(r[h])).filter((v) => v !== null);
        const enough = vals.length >= Math.min(10, Math.ceil(rows.length * 0.1));
        return enough ? { header: h, values: vals } : null;
      }).filter(Boolean);

      const filtered = numericCols.filter(({ header, values }) => !shouldIgnore(header, values));
      const orderScore = (h) => ({
        carga: 0, consumo: 1, desliz: 2, velocidade: 3,
        rpm: 4, horas: 5, temperatura: 6, pressao_oleo: 7, pressao: 8, generico: 9
      }[semanticType(h)] ?? 99);
      filtered.sort((a, b) => orderScore(a.header) - orderScore(b.header));

      const sections = [];
      let ociosidadePct = null;
      let cargaBandsPct = null;

      // limite de gráficos para evitar latência (ajuste se quiser)
      const MAX_SPARKS = 8;
      let sparkCount = 0;

      for (const { header, values } of filtered) {
        const type = semanticType(header);
        const u = unitFor(type, header);
        const st = describe(values);
        if (!st) continue;

        const fmt = (x) => (x != null ? Number(x).toFixed(2) + u : "N/D");
        const bullets = [
          `Média: ${fmt(st.mean)}.`,
          `Mín–Máx: ${fmt(st.min)} – ${fmt(st.max)}.`
        ];

        // zeros
        const zeros = values.filter((v) => v === 0).length;
        if (zeros > 0) {
          const zPct = percent(zeros, values.length);
          bullets.push(`Zeros: ${zPct.toFixed(1)}% dos registros.`);
          if (type === "velocidade") ociosidadePct = zPct;
        }

        // bandas p/ carga/desliz
        if (shouldShowBands(type, header)) {
          const { raw, pretty } = bandsVals(values);
          bullets.push(`Faixas: ${pretty}.`);
          if (type === "carga") {
            const total = values.filter(v => Number.isFinite(v)).length || 1;
            cargaBandsPct = {
              low: percent(raw["<20%"], total),
              mid: percent(raw["20–60%"], total),
              sweet: percent(raw["60–80%"], total),
              high: percent(raw[">80%"], total)
            };
          }
        }

        // plausibilidade para consumo
        if (type === "consumo") {
          const shareHigh = consumptionPlausibility(values);
          if (shareHigh != null) {
            bullets.push(`⚠︎ ${shareHigh.toFixed(1)}% das leituras > 5 km/L — possível unidade/medição inconsistente ou trechos sem carga.`);
          }
        }

        // ações objetivas
        if (type === "carga") {
          const { raw } = bandsVals(values);
          const total = values.filter(v => Number.isFinite(v)).length || 1;
          const low = percent(raw["<20%"], total);
          const sweet = percent(raw["60–80%"], total);
          const high = percent(raw[">80%"], total);
          if (low >= 25) bullets.push(`📌 Baixa carga alta (${low.toFixed(1)}%) — redimensionar implemento e reduzir marcha lenta/manobras longas.`);
          if (sweet < 40) bullets.push(`📌 Elevar tempo em 60–80% (atual ${sweet.toFixed(1)}%) para ~50–60% com seleção de marcha/engate e ajuste de velocidade.`);
          if (high >= 15) bullets.push(`📌 Cargas >80% em ${high.toFixed(1)}% — risco de sobrecarga; ajustar marcha/velocidade/implemento.`);
        } else if (type === "desliz") {
          const over15 = percent(values.filter(v => Number.isFinite(v) && v > 15).length, values.length);
          const over30 = percent(values.filter(v => Number.isFinite(v) && v > 30).length, values.length);
          if (over15 >= 10) bullets.push(`📌 Patinagem >15% em ${over15.toFixed(1)}% — ajustar lastro/pressão (alvo 10–12%).`);
          if (over30 >= 2) bullets.push(`📌 Picos >30% em ${over30.toFixed(1)}% — reduzir velocidade em entrada de sulco/carga e otimizar técnica do operador.`);
        } else if (type === "consumo") {
          const z = percent(values.filter(v => v === 0).length, values.length);
          if (z >= 10) bullets.push(`📌 ${z.toFixed(1)}% de zeros — desligar/eco em ociosidade e revisar leitura/telemetria.`);
          bullets.push("📌 Operar próximo à faixa de torque (carga ~60–80%) e manter rotação estável para melhor km/L.");
        } else if (type === "velocidade") {
          if (ociosidadePct != null && ociosidadePct >= 10) bullets.push(`📌 Ociosidade (vel=0) em ${ociosidadePct.toFixed(1)}% — reduzir paradas improdutivas e marcha lenta prolongada.`);
          bullets.push("📌 Segmentar deslocamento vs trabalho; ajustar velocidade-alvo conforme implemento (campo típico ~5–7 km/h).");
        } else if (type === "horas") {
          bullets.push("📌 Se for horímetro acumulado, usar Δ(h) por janela para medir uso efetivo e cruzar com carga/velocidade.");
        } else if (type === "pressao_oleo") {
          if (st.min === 0) bullets.push("📌 Quedas a 0 podem ser falha de leitura ou evento crítico — verificar alertas e manutenção.");
        }

        // mini-gráfico
        let spark = null;
        if (sparkCount < MAX_SPARKS) {
          try { spark = await sparkline(values); sparkCount++; } catch {}
        }

        sections.push({ title: `${emojiFor(type)} ${header}`, bullets, spark });
      }

      // resumo final
      if (sections.length) {
        const bullets = [];
        if (ociosidadePct != null) bullets.push(`Reduzir ociosidade (vel=0): ${ociosidadePct.toFixed(1)}% — implantar protocolo de paradas/ECO.`);
        if (cargaBandsPct) {
          if (cargaBandsPct.sweet < 40) bullets.push(`Aumentar tempo em carga 60–80% (atual ${cargaBandsPct.sweet.toFixed(1)}%) para ~50–60%.`);
          if (cargaBandsPct.low >= 25) bullets.push(`Baixa carga elevada (${cargaBandsPct.low.toFixed(1)}%) — revisar implementos/tarefas e marcha lenta.`);
          if (cargaBandsPct.high >= 15) bullets.push(`Cargas >80% frequentes (${cargaBandsPct.high.toFixed(1)}%) — risco de sobrecarga; ajustar marcha/velocidade/implemento.`);
        }
        sections.push({
          title: "📌 Resumo de Melhorias e Próximas Ações",
          bullets: bullets.length ? bullets : [
            "Padronizar faixas de operação por tarefa e treinar operadores.",
            "Revisar calibragem/lastro e dimensionamento de implementos.",
            "Mitigar marcha lenta e paradas prolongadas sem demanda."
          ]
        });
      }

      // análise longa (opcional)
      let analise = "";
      try {
        if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY ausente");
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const sample = rows.slice(0, 150).map((r) => { const o = {}; for (const k of headers) o[k] = r[k]; return o; });
        const prompt = `
Você é especialista em telemetria agrícola. Gere um relatório textual detalhado e objetivo para "${modelo}" (cliente: "${cliente}").
Use nomes exatos das colunas numéricas como títulos. Para cada coluna: média, mín–máx, zeros/picos e recomendações com thresholds.
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
      } catch (e) { console.error("Falha OpenAI:", e); }

      return res.status(200).json({
        ok: true,
        meta: {
          cliente,
          modelo,
          periodo: { inicio: inicio ? inicio.toISOString() : null, fim: fim ? fim.toISOString() : null },
          totalFrames: rows.length
        },
        sections, // cada item pode trazer spark (data:image/png;base64,...)
        analysis: analise
      });
    } catch (e) {
      console.error("Erro interno:", e);
      return res.status(500).json({ ok: false, error: "Erro interno na análise." });
    }
  });
}
