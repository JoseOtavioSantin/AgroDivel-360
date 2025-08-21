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
    vel: find("veloc") || find("km/h")
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

      // período
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
        vel: describe(serie.vel),
      };

      // métricas operacionais
      const total = rows.length;
      const idle = col.vel ? rows.filter((r)=> toNum(r[col.vel]) === 0).length : 0;
      const baixaCarga = col.carga ? rows.filter((r)=> {
        const v = toNum(r[col.carga]); return v !== null && v < 20;
      }).length : 0;
      const mediaCarga = stats.carga?.mean ?? null;
      const altaCarga = col.carga ? rows.filter((r)=> {
        const v = toNum(r[col.carga]); return v !== null && v > 80;
      }).length : 0;
      const altoDesliz = col.desliz ? rows.filter((r)=> {
        const v = toNum(r[col.desliz]); return v !== null && v > 15;
      }).length : 0;

      // distribuição por faixas de carga
      const faixasCarga = { "<20%":0, "20–60%":0, "60–80%":0, ">80%":0 };
      if (serie.carga.length) {
        for (const v of serie.carga) {
          if (v < 20) faixasCarga["<20%"]++;
          else if (v < 60) faixasCarga["20–60%"]++;
          else if (v < 80) faixasCarga["60–80%"]++;
          else faixasCarga[">80%"]++;
        }
      }

      // texto “sections” gerado localmente (sempre presente)
      const fmt = (x, u="") => (x!=null ? Number(x).toFixed(2) + u : "N/D");
      const pct = (n) => fmt(percent(n,total), "%");

      const sections = {
        carga: {
          title: "🔧 Carga do Motor",
          bullets: [
            `Média: ${fmt(stats.carga?.mean, "%")}.`,
            `Distribuição por faixas: <20% = ${pct(faixasCarga["<20%"])}, 20–60% = ${pct(faixasCarga["20–60%"])}, 60–80% = ${pct(faixasCarga["60–80%"])}, >80% = ${pct(faixasCarga[">80%"])}.`,
            `Picos observados: ${fmt(stats.carga?.max, "%")} (mínimo ${fmt(stats.carga?.min, "%")}).`,
            (mediaCarga!=null && mediaCarga < 40)
              ? "O que isso mostra: longos períodos em baixa utilização — possivelmente implemento leve ou ociosidade/manobras."
              : "O que isso mostra: distribuição de carga razoável; avaliar picos e tempo em baixa carga para otimização.",
            "📌 Sugestão: revisar o dimensionamento do implemento e manter operação na faixa de torque (60–80% de carga) sempre que possível."
          ]
        },
        consumo: {
          title: "⛽ Consumo de Combustível",
          bullets: [
            `Média: ${fmt(stats.consumo?.mean, " km/L")} | Q1–Q3: ${fmt(stats.consumo?.q1)} – ${fmt(stats.consumo?.q3)} km/L.`,
            `Variação: mín ${fmt(stats.consumo?.min, " km/L")} | máx ${fmt(stats.consumo?.max, " km/L")} (valores muito altos tendem a ocorrer sem carga/descidas).`,
            "📌 Sugestões:",
            "• Reduzir marcha lenta prolongada.",
            "• Operar próximo à faixa de torque ideal (60–80% de carga).",
            "• Conferir pressão/lastro e regulagens do implemento (impacta consumo)."
          ]
        },
        deslizamento: {
          title: "🛞 Deslizamento (Patinagem)",
          bullets: [
            `Média: ${fmt(stats.desliz?.mean, "%")} | recomendado (tração em solo normal): 10–12%.`,
            `Máximo registrado: ${fmt(stats.desliz?.max, "%")} | Quadros acima de 15%: ${pct(altoDesliz)}.`,
            "📌 Sugestões:",
            "• Ajustar lastro e pressão dos pneus ao tipo de solo.",
            "• Evitar trabalhar com velocidade excessiva para a tração disponível."
          ]
        },
        velocidade: {
          title: "🚜 Velocidade no Solo",
          bullets: [
            `Média: ${fmt(stats.vel?.mean, " km/h")} | Mediana: ${fmt(stats.vel?.med, " km/h")} | Mín–Máx: ${fmt(stats.vel?.min, " km/h")} – ${fmt(stats.vel?.max, " km/h")}.`,
            `Ociosidade (vel=0): ${pct(idle)}.`,
            "📌 Observação: para muitas operações agrícolas, 5–7 km/h costuma ser adequado — alinhar a velocidade ao implemento/tarefa."
          ]
        },
        resumo: {
          title: "📌 Resumo de Melhorias Potenciais",
          bullets: [
            (mediaCarga!=null && mediaCarga < 40)
              ? "Uso recorrente em baixa carga → possível superdimensionamento do trator para a tarefa."
              : "Ajustar distribuição de carga para permanecer mais tempo em 60–80%.",
            "Rever consumo → reduzir marcha lenta e trabalhar em faixa de torque ideal.",
            "Picos de deslizamento → conferir lastro/pressão e técnica de operação.",
            "Mitigar ociosidade → padronizar paradas e tempo em neutro/marcha lenta."
          ]
        }
      };

      // Texto longo via OpenAI (opcional); se falhar, front mostra as seções acima
      let analise = "";
      try {
        if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY ausente");
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const preferredCols = [col.ts, col.carga, col.consumo, col.desliz, col.vel].filter(Boolean);
        const sample = rows.slice(0, 150).map((r) => {
          const o = {};
          for (const k of preferredCols) if (k in r) o[k] = r[k];
          return Object.keys(o).length ? o : r;
        });

        const prompt = `
Você é especialista em telemetria agrícola. Gere um relatório textual detalhado e didático para o trator ${modelo} (cliente: ${cliente}),
organizado nas seções: Carga do Motor, Consumo, Deslizamento e Velocidade, finalizando com um Resumo de Melhorias Potenciais.
Use números (médias, Q1–Q3, máximos, percentuais de faixas e ociosidade) quando disponíveis. Evite gráficos.

Resumo calculado:
- Ociosidade (vel=0): ${percent(idle,total).toFixed(1)}%
- Faixas de carga: <20%=${percent(faixasCarga["<20%"],total).toFixed(1)}%, 20–60%=${percent(faixasCarga["20–60%"],total).toFixed(1)}%, 60–80%=${percent(faixasCarga["60–80%"],total).toFixed(1)}%, >80%=${percent(faixasCarga[">80%"],total).toFixed(1)}%
- Deslizamento alto (>15%): ${percent(altoDesliz,total).toFixed(1)}%

Amostra de dados (máx 150 linhas):
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

      // Resposta JSON (sem gráficos)
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
          }
        },
        sections,     // sempre vem estruturado
        analysis: analise // texto longo opcional (se a OpenAI respondeu)
      });
    } catch (e) {
      console.error("Erro interno:", e);
      return res.status(500).json({ ok: false, error: "Erro interno na análise." });
    }
  });
}
