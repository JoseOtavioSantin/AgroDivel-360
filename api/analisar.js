// api/analisar.js
import formidable from "formidable";
import * as XLSX from "xlsx";
import OpenAI from "openai";
import PDFDocument from "pdfkit";

export const config = { api: { bodyParser: false } }; // necessário p/ upload

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Método não permitido");
  }

  try {
    const form = formidable({ multiples: false, keepExtensions: true });
    form.parse(req, async (err, fields, files) => {
      if (err) return res.status(500).send("Erro no upload");

      const cliente = fields.cliente || "N/D";
      const modelo = fields.modelo || "N/D";
      const filePath = files?.relatorio?.filepath;

      if (!filePath) return res.status(400).send("Arquivo não recebido");

      // Lê o Excel (primeira planilha)
      const workbook = XLSX.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const dados = XLSX.utils.sheet_to_json(sheet);

      // Monta prompt (usei recorte de dados para não estourar tokens)
      const prompt = `
Analise os dados de telemetria do trator ${modelo}, cliente ${cliente}.
Resuma: carga do motor, consumo, deslizamento e velocidade (médias, picos, outliers).
Aponte gargalos e recomendações práticas (balastro/pneus, marcha lenta, faixa de torque, velocidade ideal).
Gere um texto claro em tópicos e um resumo executivo curto.

Dados (amostra):
${JSON.stringify(dados.slice(0, 120))}
`;

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const resposta = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3
      });

      const analise = resposta.choices?.[0]?.message?.content || "Sem retorno da análise.";

      // Gera PDF simples com a análise (depois dá pra incrementarmos com gráficos)
      const pdf = new PDFDocument({ margin: 36 });
      const chunks = [];
      pdf.on("data", (c) => chunks.push(c));
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
      pdf.moveDown().moveDown();
      pdf.fontSize(12).text(analise, { align: "left" });

      pdf.end();
    });
  } catch (e) {
    console.error(e);
    res.status(500).send("Erro interno na análise.");
  }
}
