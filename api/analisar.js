// /api/analisar.js
import formidable from "formidable";
import * as XLSX from "xlsx";
import OpenAI from "openai";
import fs from "node:fs";
import * as ss from "simple-statistics";
import dayjs from "dayjs";

export const config = { api: { bodyParser: false } };

// ---------- Utils ----------
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

// mapeia nomes de colunas com tolerância
function detectColumns(headers) {
  const h = headers.map((x) => ({ raw: x, n: norm(x) }));
  const find = (...needles) =>
    h.find(({ n }) => needles.every((k) => n.includes(k)))?.raw;

  return {
    ts:
      find("carimbo", "data") ||
      find("timestamp") ||
      find("hora") ||
      find("data"),
    carga: find("carga", "motor") || find("carga"),
    consumo:
      find("combustivel", "distancia") ||
      find("km/l") ||
      find("consumo"),
    desliz: find("desliz") || find("patin"),
    vel: find("veloc") || find("km/h"),
    lat: find("lat"),
    lon: find("lon")
  };
}

// histograma simples
function histogram(data, bins = 12) {
  const a = data.filter((v) => Number.isFinite(v));
  if (!a.length) return { labels: [], values: [] };
  const min = Math.min(...a), max = Math.max(...a);
  if (min === max) return { labels: [String(min)], values: [a.length] };
  const width = (max - min) / bins;
  const edges = Array.from({ length: bins + 1 }, (_, i) => min + i * width);
  const counts = Array(bins).fill(0);
  for (const v of a) {
    let idx = Math.min(Math.floor((v - min) / width), bins - 1);
    counts[idx]++;
  }
  const labels = counts.map((_, i) => {
    const a = edges[i], b = edges[i + 1];
    return `${a.toFixed(1)}–${b.toFixed(1)}`;
  });
  return { labels, values: counts };
}

// Gera PNG via QuickChart (sem lib externa)
async function chartPNG(config, w = 900, h = 500) {
  const resp = await fetch("https://quickchart.io/chart", {
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
  if (!resp.ok) throw new Error(`QuickChart HTTP ${resp.status}`);
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab); // Buffer
}

// ---------- Handler ----------
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

      const fileObj = firstFileFrom(files);
      const filePath = fileObj?.filepath;
      if (!filePath) return res.status(400).json({ ok: false, error: "Arquivo .xlsx não recebido" });

      // Lê Excel
      const buffer = fs.readFileSync(filePath);
      const wb = XLSX.read(buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
      if (!rows.length) return res.status(400).json({ ok: false, error: "Planilha vazia" });

      const headers = Object.keys(rows[0] ?? {});
      const col = detectColumns(headers);

      // Normaliza séries
      const serie = {
        carga: col.carga ? rows.map((r) => toNum(r[col.carga])).filter((v) => v !== null) : [],
        consumo: col.consumo ? rows.map((r) => toNum(r[col.consumo])).filter((v) => v !== null) : [],
        desliz: col.desliz ? rows.map((r) => toNum(r[col.desliz])).filter((v) => v !== null) : [],
        vel: col.vel ? rows.map((r) => toNum(r[col.vel])).filter((v) => v !== null) : [],
      };

      // janela de tempo
      let inicio = null, fim = null;
      if (col.ts) {
        const ts = rows
          .map((r) => r[col.ts])
          .map((t) => (t ? dayjs(String(t)) : null))
          .filter((d) => d && d.isValid())
          .map((d) => d.toDate().getTime())
          .sort((a,b)=>a-b);
        if (ts.length) { inicio = new Date(ts[0]); fim = new Date(ts[ts.length-1]); }
      }

      // stats
      const stats = {
        carga: describe(serie.carga),
        consumo: describe(serie.consumo),
        desliz: describe(serie.desliz),
        vel: describe(serie.vel)
      };

      // métricas operacionais
      const total = rows.length;
      const idle = col.vel ? rows.filter((r)=> toNum(r[col.vel]) === 0).length : 0;
      const baixaCarga = col.carga ? rows.filter((r)=> {
        const v = toNum(r[col.carga]); return v !== null && v < 20;
      }).length : 0;
      const altaCarga = col.carga ? rows.filter((r)=> {
        const v = toNum(r[col.carga]); return v !== null && v > 80;
      }).length : 0;
      const altoDesliz = col.desliz ? rows.filter((r)=> {
        const v = toNum(r[col.desliz]); return v !== null && v > 15;
      }).length : 0;

      // correlações (se do mesmo tamanho)
      const corr = {};
      const sameLen = (a,b) => a.length && b.length && a.length === b.length;
      if (sameLen(serie.carga, serie.vel)) corr.carga_vel = ss.sampleCorrelation(serie.carga, serie.vel);
      if (sameLen(serie.carga, serie.consumo)) corr.carga_consumo = ss.sampleCorrelation(serie.carga, serie.consumo);
      if (sameLen(serie.desliz, serie.vel)) corr.desliz_vel = ss.sampleCorrelation(serie.desliz, serie.vel);

      // amostra de dados para o modelo
      const preferredCols = [col.ts, col.carga, col.consumo, col.desliz, col.vel].filter(Boolean);
      const sample = rows.slice(0, 200).map((r) => {
        const o = {};
        for (const k of preferredCols) if (k in r) o[k] = r[k];
        return Object.keys(o).length ? o : r;
      });

      const headerMap = Object.entries(col)
        .filter(([,v]) => v)
        .map(([k,v]) => `- ${k}: "${v}"`).join("\n");

      const resumoOp = `
Período: ${inicio ? inicio.toISOString() : "N/D"} → ${fim ? fim.toISOString() : "N/D"}
Frames: ${total}
Ociosidade (vel=0): ${percent(idle,total).toFixed(1)}%
Baixa carga (<20%): ${percent(baixaCarga,total).toFixed(1)}%
Alta carga (>80%): ${percent(altaCarga,total).toFixed(1)}%
Deslizamento alto (>15%): ${percent(altoDesliz,total).toFixed(1)}%
Correlação carga vs vel: ${Number.isFinite(corr.carga_vel) ? corr.carga_vel.toFixed(2) : "N/D"}
Correlação carga vs consumo: ${Number.isFinite(corr.carga_consumo) ? corr.carga_consumo.toFixed(2) : "N/D"}
Correlação desliz vs vel: ${Number.isFinite(corr.desliz_vel) ? corr.desliz_vel.toFixed(2) : "N/D"}
`.trim();

      // chamada ao modelo
      let analise = "";
      try {
        if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY ausente");
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const prompt = `
Você é especialista em telemetria agrícola. Analise o trator ${modelo} (cliente: ${cliente}).

Colunas detectadas:
${headerMap || "(não detectadas; use heurísticas por conteúdo)"}

Resumo operacional calculado:
${resumoOp}

Para cada indicador disponível nos dados (mesmo que os nomes mudem), produza:
1) RESUMO EXECUTIVO (5–8 bullets com números).
2) DIAGNÓSTICO DETALHADO:
   - Carga do motor (média, Q1–Q3, faixas <20/20–60/60–80/>80, riscos).
   - Eficiência de combustível (km/L), relação com carga/velocidade.
   - Deslizamento (%): distribuição, picos, impacto.
   - Velocidade (km/h): coerência com a operação agrícola, variação e picos.
3) GARGALOS & OPORTUNIDADES (ociosidade, patinagem, baixa carga, faixa de torque).
4) RECOMENDAÇÕES PRÁTICAS PRIORITÁRIAS (lastro/pneus, marcha lenta, velocidade-alvo, implemento, treinamento).
5) PRÓXIMAS AÇÕES (checklist curto).

Seja didático e específico.
Amostra de dados (máx 200 linhas):
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

      // ---------- Gráficos (PNG base64) ----------
      const charts = [];

      // Histograma CARGA
      if (serie.carga.length) {
        const hist = histogram(serie.carga, 12);
        const cfg = {
          type: "bar",
          data: { labels: hist.labels, datasets: [{ label: "Distribuição da Carga (%)", data: hist.values }] },
          options: {
            plugins: { legend: { display: true }, title: { display: true, text: "Histograma de Carga do Motor" } },
            scales: { y: { beginAtZero: true } }
          }
        };
        const buf = await chartPNG(cfg);
        charts.push({ title: "Histograma de Carga", src: `data:image/png;base64,${buf.toString("base64")}` });
      }

      // Histograma DESLIZAMENTO
      if (serie.desliz.length) {
        const hist = histogram(serie.desliz, 12);
        const cfg = {
          type: "bar",
          data: { labels: hist.labels, datasets: [{ label: "Distribuição do Deslizamento (%)", data: hist.values }] },
          options: {
            plugins: { legend: { display: true }, title: { display: true, text: "Histograma de Deslizamento" } },
            scales: { y: { beginAtZero: true } }
          }
        };
        const buf = await chartPNG(cfg);
        charts.push({ title: "Histograma de Deslizamento", src: `data:image/png;base64,${buf.toString("base64")}` });
      }

      // Barras: faixas de carga
      if (serie.carga.length) {
        const faixas = { "<20%": 0, "20–60%": 0, "60–80%": 0, ">80%": 0 };
        for (const v of serie.carga) {
          if (v < 20) faixas["<20%"]++;
          else if (v < 60) faixas["20–60%"]++;
          else if (v < 80) faixas["60–80%"]++;
          else faixas[">80%"]++;
        }
        const cfg = {
          type: "bar",
          data: { labels: Object.keys(faixas), datasets: [{ label: "Frames", data: Object.values(faixas) }] },
          options: {
            plugins: { legend: { display: false }, title: { display: true, text: "Tempo por Faixa de Carga" } },
            scales: { y: { beginAtZero: true } }
          }
        };
        const buf = await chartPNG(cfg);
        charts.push({ title: "Tempo por Faixa de Carga", src: `data:image/png;base64,${buf.toString("base64")}` });
      }

      // Dispersão: Carga vs Velocidade
      if (serie.carga.length && serie.vel.length && serie.carga.length === serie.vel.length) {
        const points = serie.carga.map((v, i) => ({ x: v, y: serie.vel[i] }));
        const cfg = {
          type: "scatter",
          data: { datasets: [{ label: "Pontos", data: points }] },
          options: {
            plugins: { legend: { display: false }, title: { display: true, text: "Dispersão: Carga x Velocidade" } },
            scales: { x: { title: { display: true, text: "Carga (%)" } }, y: { title: { display: true, text: "Velocidade (km/h)" } } }
          }
        };
        const buf = await chartPNG(cfg);
        charts.push({ title: "Dispersão Carga x Velocidade", src: `data:image/png;base64,${buf.toString("base64")}` });
      }

      // Dispersão: Carga vs Consumo
      if (serie.carga.length && serie.consumo.length && serie.carga.length === serie.consumo.length) {
        const points = serie.carga.map((v, i) => ({ x: v, y: serie.consumo[i] }));
        const cfg = {
          type: "scatter",
          data: { datasets: [{ label: "Pontos", data: points }] },
          options: {
            plugins: { legend: { display: false }, title: { display: true, text: "Dispersão: Carga x Consumo (km/L)" } },
            scales: { x: { title: { display: true, text: "Carga (%)" } }, y: { title: { display: true, text: "Consumo (km/L)" } } }
          }
        };
        const buf = await chartPNG(cfg);
        charts.push({ title: "Dispersão Carga x Consumo", src: `data:image/png;base64,${buf.toString("base64")}` });
      }

      // Resposta JSON para o frontend renderizar
      return res.status(200).json({
        ok: true,
        meta: {
          cliente,
          modelo,
          periodo: { inicio: inicio ? inicio.toISOString() : null, fim: fim ? fim.toISOString() : null },
          totalFrames: total
        },
        columns: col,
        kpis: {
          stats,
          taxas: {
            ociosidade_pct: percent(idle,total),
            baixa_carga_pct: percent(baixaCarga,total),
            alta_carga_pct: percent(altaCarga,total),
            desliz_alto_pct: percent(altoDesliz,total)
          },
          correlacoes: corr
        },
        analysis: analise,
        charts
      });
    } catch (e) {
      console.error("Erro interno:", e);
      return res.status(500).json({ ok: false, error: "Erro interno na análise." });
    }
  });
}
