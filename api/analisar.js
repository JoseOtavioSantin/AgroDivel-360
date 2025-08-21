// /api/analisar.js
import formidable from "formidable";
import * as XLSX from "xlsx";
import OpenAI from "openai";
import PDFDocument from "pdfkit";
import fs from "node:fs";

export const config = { api: { bodyParser: false } }; // necessário p/ upload

// pega o primeiro arquivo, mesmo que o name esteja diferente
function firstFileFrom(files) {
  if (!files) return null;
  if (files.relatorio) return Array.isArray(files.relatorio) ? files.relatorio[0] : files.relatorio;
  const keys = Object.keys(files);
  if (!keys.length) return null;
  const any = files[keys[0]];
  return Array.isArray(any) ? any[0] : any;
}

// estatísticas simples p/ fallback
function estatisticasBasicas(rows) {
  const num = v => (isFinite(parseFloat(v)) ? parseFloat(v) : null);
  const pick = (row, keys) => {
    for (const k of keys) if (k in row) return num(row[k]);
    return null;
  };
  const acc = { motor: [], consumo: [], desl: [], vel: [] };
  const colMotor = ["Carga do motor", "Carga do Motor", "Carga (%)"];
  const colCons  = ["Combustível por distância - Média", "Consumo (km/L)", "Consumo"];
  const colDesl  = ["Deslizamento", "Patinagem (%)"];
  const colVel   = ["Velocidade no solo", "Velocidade (km/h)"];

  for (const r of rows) {
    const m = pick(r, colMotor); if (m !== null) acc.motor.push(m);
    const c = pick(r, colCons ); if (c !== null) acc.consumo.push(c);
    const d = pick(r, colDesl  ); if (d !== null) acc.desl.push(d);
    const v = pick(r, colVel   ); if (v !== null) acc.vel.push(v);
  }
  const stat = (a) => a.length ? ({
    mean: a.reduce((x,y)=>x+y,0)/a.length,
    min: Math.min(...a),
    max: Math.max(...a)
  }) : null;

  return {
    motor:   stat(acc.motor),
    consumo: stat(acc.consumo),
    desl:    stat(acc.desl),
    vel:     stat(acc.vel)
  };
}

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

      // >>>>>>> CORREÇÃO AQUI: ler como Buffer + XLSX.read(buffer)
      const buffer = fs.readFileSync(filePath);
      const wb = XLSX.read(buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      if (!rows.length) return res.status(400).send("Planilha vazia");

      const colsPreferidas = [
        "Carimbo de data/hora",
        "Carga do motor",
        "Combustível por distância - Média",
        "Deslizamento",
        "Velocidade no solo",
        "Localização",
      ];
      const sample = rows.slice(0, 200).map(r => {
        const o = {};
        for (const k of Object.keys(r)) if (colsPreferidas.includes(k)) o[k] = r[k];
        return Object.keys(o).length ? o : r;
      });

      const stats = estatisticasBasicas(rows);

      const prompt = `
Você é especialista em telemetria agrícola. Analise o trator ${modelo} (cliente: ${cliente}).
Entregue:
- Resumo executivo (3–5 bullets)
- Diagnóstico por indicador: Carga do motor, Consumo (km/L), Deslizamento (%), Velocidade (km/h)
- Gargalos (ociosidade, picos, patinagem)
- Recomendações práticas (balastro/pneus, marcha lenta, faixa de torque 60–80%, velocidade, dimensionamento)
- Próximas ações operacionais
Amostra (máx 200 linhas):
${JSON.stringify(sample)}
`;

      let analise = "";
      try {
        if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY ausente");
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const resp = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.3,
          messages: [{ role: "user", content: prompt }],
        });
        analise = resp?.choices?.[0]?.message?.content?.trim() || "";
      } catch (e) {
        console.error("Falha OpenAI:", e);
      }

      if (!analise) {
        const fmt = (o,u="") => o ? `média ${o.mean.toFixed(2)}${u} (min ${o.min.toFixed(2)}, máx ${o.max.toFixed(2)})` : "sem dados";
        analise =
`Resumo automático (fallback):
- Carga do motor: ${fmt(stats.motor, "%")}
- Consumo: ${fmt(stats.consumo, " km/L")}
- Deslizamento: ${fmt(stats.desl, "%")}
- Velocidade: ${fmt(stats.vel, " km/h")}
Sugestões: reduzir marcha lenta; operar 60–80% de carga; ajustar pressão/lastro p/ ~10–12% de deslizamento; revisar dimensionamento do implemento.`;
      }

      // Gera PDF com conteúdo
      const pdf = new PDFDocument({ margin: 36 });
      const chunks = [];
      pdf.on("data", c => chunks.push(c));
      pdf.on("end", () => {
        const buf = Buffer.concat(chunks);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${cliente}_${modelo}_relatorio.pdf"`);
        res.send(buf);
      });

      pdf.fontSize(18).text("Relatório de Desempenho", { align: "center" });
      pdf.moveDown();
      pdf.fontSize(12).text(`Cliente: ${cliente}`);
      pdf.text(`Modelo: ${modelo}`);
      pdf.moveDown();

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

      pdf.fontSize(12).text(analise, { align: "left" });
      pdf.end();
    } catch (e) {
      console.error("Erro interno:", e);
      res.status(500).send("Erro interno na análise.");
    }
  });
}
