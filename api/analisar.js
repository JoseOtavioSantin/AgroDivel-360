// /api/analisar.js
import formidable from "formidable";
import * as XLSX from "xlsx";
import OpenAI from "openai";
import PDFDocument from "pdfkit";

export const config = { api: { bodyParser: false } };

function estatisticasBasicas(rows) {
  // tenta encontrar colunas padrão pelos nomes mais comuns
  const getNum = (v) => (isFinite(parseFloat(v)) ? parseFloat(v) : null);
  const pick = (row, keys) => {
    for (const k of keys) if (k in row) return getNum(row[k]);
    return null;
  };

  const colMotor = ["Carga do motor", "Carga do Motor", "Carga (%)"];
  const colCons  = ["Combustível por distância - Média", "Consumo (km/L)", "Consumo"];
  const colDesl  = ["Deslizamento", "Patinagem (%)"];
  const colVel   = ["Velocidade no solo", "Velocidade (km/h)"];

  const acc = { motor: [], consumo: [], desl: [], vel: [] };

  for (const r of rows) {
    const m = pick(r, colMotor); if (m !== null) acc.motor.push(m);
    const c = pick(r, colCons ); if (c !== null) acc.consumo.push(c);
    const d = pick(r, colDesl  ); if (d !== null) acc.desl.push(d);
    const v = pick(r, colVel   ); if (v !== null) acc.vel.push(v);
  }

  const stat = (arr) => {
    if (!arr.length) return null;
    const s = arr.reduce((a,b)=>a+b,0);
    const mean = s / arr.length;
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    return { mean, min, max };
  };

  return {
    motor:   stat(acc.motor),
    consumo: stat(acc.consumo),
    desl:    stat(acc.desl),
    vel:     stat(acc.vel)
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Método não permitido");

  try {
    const form = formidable({ multiples: false, keepExtensions: true });
    form.parse(req, async (err, fields, files) => {
      try {
        if (err) {
          console.error("Upload parse error:", err);
          return res.status(400).send("Erro no upload");
        }

        const cliente = String(fields.cliente || "N/D");
        const modelo  = String(fields.modelo  || "N/D");
        const file    = files?.relatorio;
        const filePath = Array.isArray(file) ? file[0]?.filepath : file?.filepath;

        if (!filePath) return res.status(400).send("Arquivo .xlsx não recebido");

        // Ler planilha
        const wb = XLSX.readFile(filePath);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws);
        if (!rows.length) return res.status(400).send("Planilha vazia");

        // Amostra segura pra API (evitar payload gigante)
        // Mantém só colunas relevantes se existirem
        const colsDesejadas = [
          "Carimbo de data/hora",
          "Carga do motor",
          "Combustível por distância - Média",
          "Deslizamento",
          "Velocidade no solo",
          "Localização",
        ];
        const sample = rows.slice(0, 200).map(r => {
          const o = {};
          for (const k of Object.keys(r)) {
            if (colsDesejadas.includes(k)) o[k] = r[k];
          }
          // se não encontrou pelos nomes acima, manda tudo mesmo
          return Object.keys(o).length ? o : r;
        });

        const stats = estatisticasBasicas(rows);

        // Prompt “sênior” para análise
        const basePrompt = `
Você é um especialista em telemetria agrícola. Analise os dados do trator ${modelo} (cliente: ${cliente}).
Entregue:
1) Resumo executivo (3-5 bullets)
2) Diagnóstico por indicador: Carga do motor, Consumo (km/L), Deslizamento (%), Velocidade (km/h)
3) Gargalos e momentos críticos (picos/ociosos)
4) Recomendações práticas (balastro/pneus, marcha lenta, faixa de torque, velocidade, dimensionamento de implemento)
5) Próximas ações

Respeite formato claro, com tópicos curtos e objetivos.

Amostra de dados (máx 200 linhas):
${JSON.stringify(sample)}
`;

        let analise = "";

        try {
          if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY ausente");
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

          const resp = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.3,
            messages: [{ role: "user", content: basePrompt }]
          });

          analise = resp?.choices?.[0]?.message?.content?.trim() || "";
        } catch (apiErr) {
          console.error("Falha OpenAI:", apiErr);
          analise = "";
        }

        // Fallback: se a análise vier vazia, gera um texto com as estatísticas básicas
        if (!analise) {
          const fmt = (o, unidade="") =>
            o ? `média ${o.mean.toFixed(2)}${unidade} (min ${o.min.toFixed(2)}, máx ${o.max.toFixed(2)})` : "sem dados";

          analise =
`Resumo automático (fallback):
- Carga do motor: ${fmt(stats.motor, "%")}
- Consumo (km/L): ${fmt(stats.consumo, " km/L")}
- Deslizamento: ${fmt(stats.desl, "%")}
- Velocidade: ${fmt(stats.vel, " km/h")}

Sugestões:
- Evitar longos períodos em marcha lenta; trabalhar na faixa de torque ideal (60–80% carga).
- Ajustar pressão/lastro dos pneus para manter deslizamento ~10–12%.
- Revisar dimensionamento de implemento se carga média < 40% por longos períodos.
- Padronizar velocidade operacional para a atividade/implemento.
(Observação: gerei este bloco porque a API não retornou análise detalhada.)`;
        }

        // ==== Gera PDF (sempre com conteúdo) ====
        const pdf = new PDFDocument({ margin: 36 });
        const chunks = [];
        pdf.on("data", (c) => chunks.push(c));
        pdf.on("end", () => {
          const buf = Buffer.concat(chunks);
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${cliente}_${modelo}_relatorio.pdf"`
          );
          res.send(buf);
        });

        pdf.fontSize(18).text("Relatório de Desempenho", { align: "center" });
        pdf.moveDown();
        pdf.fontSize(12).text(`Cliente: ${cliente}`);
        pdf.text(`Modelo: ${modelo}`);
        pdf.moveDown();

        // Bloco estatístico curto no cabeçalho
        if (stats) {
          const line = (t, o, u="") =>
            o ? `${t}: média ${o.mean.toFixed(2)}${u} (min ${o.min.toFixed(2)}, máx ${o.max.toFixed(2)})`
               : `${t}: sem dados`;
          pdf.fontSize(11).text(line("Carga do motor", stats.motor, "%"));
          pdf.text(line("Consumo (km/L)", stats.consumo, " km/L"));
          pdf.text(line("Deslizamento", stats.desl, "%"));
          pdf.text(line("Velocidade", stats.vel, " km/h"));
          pdf.moveDown();
        }

        // Texto principal
        pdf.fontSize(12).text(analise, { align: "left" });
        pdf.end();
      } catch (innerErr) {
        console.error("Erro interno:", innerErr);
        res.status(500).send("Erro interno na análise.");
      }
    });
  } catch (e) {
    console.error("Erro raiz:", e);
    res.status(500).send("Erro interno.");
  }
}
