// /api/analisar.js
import formidable from "formidable";
import * as XLSX from "xlsx";
import OpenAI from "openai";
import PDFDocument from "pdfkit";
import fs from "node:fs";
import QuickChart from "quickchart-js";
import ss from "simple-statistics";
import dayjs from "dayjs";

export const config = { api: { bodyParser: false } };

// ---------- Utils ----------
const toNum = (v) => {
  const n = typeof v === "string" ? v.replace(",", ".") : v;
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
};

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
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

// tenta mapear nomes de colunas comuns com tolerância
function detectColumns(headers) {
  const h = headers.map((x) => ({ raw: x, n: norm(x) }));
  const find = (...needles) =>
    h.find(({ n }) => needles.every((k) => n.includes(k)))?.raw;

  const col = {
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
  return col;
}

// cria bins simples para histogramas
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

async function chartPNG(config, w = 900, h = 500) {
  const qc = new QuickChart();
  qc.setConfig(config);
  qc.setWidth(w);
  qc.setHeight(h);
  qc.setBackgroundColor("white");
  return await qc.toBinary();
}

// ---------- Handler ----------
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Método não permitido");

  const form = formidable({ multiples: false, keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    try {
      if (err) {
        console.error("Upload parse error:", err);
        return res.status(400).send("Erro no upload");
      }

      const cliente = String(fields.cliente || "N/D");
      const modelo  = String(fields.modelo  || "N/D");

      const fileObj = firstFileFrom(files);
      const filePath = fileObj?.filepath;
      if (!filePath) return res.status(400).send("Arquivo .xlsx não recebido");

      // Lê excel (buffer) e transforma em JSON
      const buffer = fs.readFileSync(filePath);
      const wb = XLSX.read(buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
      if (!rows.length) return res.status(400).send("Planilha vazia");

      const headers = Object.keys(rows[0] ?? {});
      const col = detectColumns(headers);

      // Normaliza dados principais (dinâmico)
      const serie = {
        carga: rows.map((r) => toNum(col.carga ? r[col.carga] : null)).filter((v) => v !== null),
        consumo: rows.map((r) => toNum(col.consumo ? r[col.consumo] : null)).filter((v) => v !== null),
        desliz: rows.map((r) => toNum(col.desliz ? r[col.desliz] : null)).filter((v) => v !== null),
        vel: rows.map((r) => toNum(col.vel ? r[col.vel] : null)).filter((v) => v !== null)
      };

      // timestamp (opcional)
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

      // Estatísticas + métricas operacionais
      const stats = {
        carga: describe(serie.carga),
        consumo: describe(serie.consumo),
        desliz: describe(serie.desliz),
        vel: describe(serie.vel)
      };

      // Heurísticas de eficiência
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

      // Correlações (se ambas séries existirem)
      const corr = {};
      if (serie.carga.length && serie.vel.length && serie.carga.length === serie.vel.length) {
        corr.carga_vel = ss.sampleCorrelation(serie.carga, serie.vel);
      }
      if (serie.carga.length && serie.consumo.length && serie.carga.length === serie.consumo.length) {
        corr.carga_consumo = ss.sampleCorrelation(serie.carga, serie.consumo);
      }
      if (serie.desliz.length && serie.vel.length && serie.desliz.length === serie.vel.length) {
        corr.desliz_vel = ss.sampleCorrelation(serie.desliz, serie.vel);
      }

      // Amostra curta e nomes detectados para mandar ao modelo
      const preferredCols = [col.ts, col.carga, col.consumo, col.desliz, col.vel].filter(Boolean);
      const sample = rows.slice(0, 200).map((r) => {
        const o = {};
        for (const k of preferredCols) if (k in r) o[k] = r[k];
        return Object.keys(o).length ? o : r;
      });

      // Prompt avançado (dinâmico, explica colunas encontradas)
      const headerMap = Object.entries(col)
        .filter(([,v]) => v)
        .map(([k,v]) => `- ${k}: "${v}"`)
        .join("\n");

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

      const openai = process.env.OPENAI_API_KEY
        ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
        : null;

      let analise = "";
      try {
        if (!openai) throw new Error("OPENAI_API_KEY ausente");
        const prompt = `
Você é especialista em telemetria agrícola. Analise o trator ${modelo} (cliente: ${cliente}).

Colunas detectadas:
${headerMap || "(não detectadas, usar heurísticas por conteúdo)"}

Resumo operacional calculado:
${resumoOp}

Para cada indicador disponível nos dados (mesmo que os nomes mudem), produza:
1) RESUMO EXECUTIVO (5–8 bullets diretos, com números).
2) DIAGNÓSTICO DETALHADO:
   - Carga do motor: média, dispersão (Q1–Q3), tempo em faixas (<20%, 20–60%, 60–80%, >80%), risco de super/subdimensionamento.
   - Eficiência de combustível (km/L ou equivalente): níveis típicos por faixa de carga/velocidade.
   - Deslizamento/Patinagem: distribuição, momentos críticos, impacto esperado.
   - Velocidade operacional: coerência com a operação agrícola, variação e picos.
3) GARGALOS & OPORTUNIDADES:
   - Ociosidade, picos de patinagem, baixa carga recorrente, uso fora da faixa de torque.
4) RECOMENDAÇÕES PRÁTICAS E PRIORIZADAS:
   - Ajustes de lastro/pressão pneus, redução de marcha lenta, velocidade alvo por operação, adequação de implemento, treinamento de operador.
5) PRÓXIMAS AÇÕES (checklist curto e objetivo).

Seja didático e específico. Evite generalidades.
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

      // ---------- Gráficos (sem linhas) ----------
      const images = [];

      // HISTOGRAMA de CARGA (%)
      if (serie.carga.length) {
        const hist = histogram(serie.carga, 12);
        const cfg = {
          type: "bar",
          data: {
            labels: hist.labels,
            datasets: [{ label: "Distribuição da Carga (%)", data: hist.values }]
          },
          options: {
            plugins: { legend: { display: true }, title: { display: true, text: "Histograma de Carga do Motor" } },
            scales: { x: { ticks: { maxRotation: 0 } }, y: { beginAtZero: true } }
          }
        };
        images.push(await chartPNG(cfg));
      }

      // HISTOGRAMA de DESLIZAMENTO (%)
      if (serie.desliz.length) {
        const hist = histogram(serie.desliz, 12);
        const cfg = {
          type: "bar",
          data: {
            labels: hist.labels,
            datasets: [{ label: "Distribuição do Deslizamento (%)", data: hist.values }]
          },
          options: {
            plugins: { legend: { display: true }, title: { display: true, text: "Histograma de Deslizamento" } },
            scales: { x: { ticks: { maxRotation: 0 } }, y: { beginAtZero: true } }
          }
        };
        images.push(await chartPNG(cfg));
      }

      // BARRAS: Tempo em faixas de carga
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
          data: {
            labels: Object.keys(faixas),
            datasets: [{ label: "Frames", data: Object.values(faixas) }]
          },
          options: {
            plugins: { legend: { display: false }, title: { display: true, text: "Tempo por Faixa de Carga" } },
            scales: { y: { beginAtZero: true } }
          }
        };
        images.push(await chartPNG(cfg));
      }

      // DISPERSÃO: Carga (%) vs Velocidade (km/h)
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
        images.push(await chartPNG(cfg));
      }

      // DISPERSÃO: Carga (%) vs Consumo (km/L) (se existir)
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
        images.push(await chartPNG(cfg));
      }

      // ---------- Montagem do PDF ----------
      const pdf = new PDFDocument({ margin: 36 });
      const chunks = [];
      pdf.on("data", (c) => chunks.push(c));
      pdf.on("end", () => {
        const buf = Buffer.concat(chunks);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${cliente}_${modelo}_relatorio.pdf"`);
        res.send(buf);
      });

      // Capa
      pdf.fontSize(18).text("Relatório de Desempenho", { align: "center" });
      pdf.moveDown();
      pdf.fontSize(12).text(`Cliente: ${cliente}`);
      pdf.text(`Equipamento: ${modelo}`);
      pdf.text(`Período analisado: ${inicio ? inicio.toLocaleString() : "N/D"} → ${fim ? fim.toLocaleString() : "N/D"}`);
      pdf.moveDown();

      // Estatísticas chave
      const line = (t, o, u = "") =>
        o
          ? `${t}: média ${o.mean.toFixed(2)}${u}  |  Q1 ${o.q1.toFixed(2)}  |  Med ${o.med.toFixed(2)}  |  Q3 ${o.q3.toFixed(2)}  |  min ${o.min.toFixed(2)}  |  máx ${o.max.toFixed(2)}`
          : `${t}: sem dados`;

      if (stats.carga || stats.consumo || stats.desliz || stats.vel) {
        pdf.fontSize(11);
        if (stats.carga)   pdf.text(line("Carga do motor (%)", stats.carga, "%"));
        if (stats.consumo) pdf.text(line("Consumo (km/L)", stats.consumo, ""));
        if (stats.desliz)  pdf.text(line("Deslizamento (%)", stats.desliz, "%"));
        if (stats.vel)     pdf.text(line("Velocidade (km/h)", stats.vel, ""));
        pdf.moveDown();
        pdf.text(`Ociosidade (vel=0): ${percent(idle,total).toFixed(1)}%  |  Baixa carga (<20%): ${percent(baixaCarga,total).toFixed(1)}%  |  Alta carga (>80%): ${percent(altaCarga,total).toFixed(1)}%  |  Desliz >15%: ${percent(altoDesliz,total).toFixed(1)}%`);
      }

      pdf.moveDown();

      // Texto da análise (sempre vem algo; se OpenAI falhar, ainda temos o cabeçalho + métricas + gráficos)
      if (analise) {
        pdf.fontSize(12).text(analise, { align: "left" });
      } else {
        pdf.fontSize(12).text("Análise automática baseada em estatísticas locais. (A API de análise não respondeu desta vez.)");
      }

      // Gráficos (cada um em sua página para ficar legível)
      for (const img of images) {
        pdf.addPage();
        pdf.fontSize(14).text("Gráfico", { align: "center" });
        pdf.moveDown();
        try {
          pdf.image(img, { fit: [520, 360], align: "center", valign: "center" });
        } catch {
          pdf.fontSize(12).text("Falha ao inserir imagem do gráfico.");
        }
      }

      pdf.end();
    } catch (e) {
      console.error("Erro interno:", e);
      res.status(500).send("Erro interno na análise.");
    }
  });
}
