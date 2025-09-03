// /api/compare.js
import formidable from "formidable";
import * as XLSX from "xlsx";
import fs from "node:fs";

// Configuração da API: permite arquivos maiores e desativa o parser padrão da Vercel
export const config = { api: { bodyParser: false, sizeLimit: "25mb" } };

// Função auxiliar para pegar os arquivos corretos do formulário
const getFilesFrom = (files) => {
  if (!files) return { pdiFile: null, etimFile: null };
  
  const pdi = files.pdi ? (Array.isArray(files.pdi) ? files.pdi[0] : files.pdi) : null;
  const etim = files.etim ? (Array.isArray(files.etim) ? files.etim[0] : files.etim) : null;
  
  return { pdiFile: pdi, etimFile: etim };
};

// Função principal da API
export default async function handler(req, res) {
  // Permite que o frontend chame a API (CORS) - importante para testes locais
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido. Use POST." });
  }

  const form = formidable({ multiples: true, keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    try {
      if (err) {
        throw new Error("Erro ao processar o upload dos arquivos.");
      }

      const { pdiFile, etimFile } = getFilesFrom(files);

      if (!pdiFile || !etimFile) {
        throw new Error("Arquivos 'pdi' e 'etim' são obrigatórios.");
      }

      // Nomes das colunas-chave
      const colunaPDI = 'Número de identificação do produto';
      const colunaETIM = 'PIN';

      // --- Leitura e Processamento ---

      // 1. Ler o arquivo ETIM e extrair os PINs para um Set (para busca rápida)
      const etimBuffer = fs.readFileSync(etimFile.filepath);
      const etimWorkbook = XLSX.read(etimBuffer, { type: "buffer" });
      const etimSheet = etimWorkbook.Sheets[etimWorkbook.SheetNames[0]];
      const etimData = XLSX.utils.sheet_to_json(etimSheet, { defval: null });

      if (etimData.length === 0 || !etimData[0].hasOwnProperty(colunaETIM)) {
        const colsDisponiveis = etimData.length > 0 ? Object.keys(etimData[0]).join(', ') : 'Nenhuma';
        throw new Error(`A coluna '${colunaETIM}' não foi encontrada no arquivo ETIM. Colunas disponíveis: [${colsDisponiveis}]`);
      }
      const etimPins = new Set(etimData.map(row => String(row[colunaETIM]).trim()));

      // 2. Ler o arquivo PDI completo
      const pdiBuffer = fs.readFileSync(pdiFile.filepath);
      const pdiWorkbook = XLSX.read(pdiBuffer, { type: "buffer" });
      const pdiSheet = pdiWorkbook.Sheets[pdiWorkbook.SheetNames[0]];
      const pdiData = XLSX.utils.sheet_to_json(pdiSheet, { defval: null });

      if (pdiData.length === 0 || !pdiData[0].hasOwnProperty(colunaPDI)) {
        const colsDisponiveis = pdiData.length > 0 ? Object.keys(pdiData[0]).join(', ') : 'Nenhuma';
        throw new Error(`A coluna '${colunaPDI}' não foi encontrada no arquivo PDI. Colunas disponíveis: [${colsDisponiveis}]`);
      }

      // 3. Filtrar as linhas do PDI que não estão no ETIM
      const chassisFaltantes = pdiData.filter(row => {
        const pdiPin = String(row[colunaPDI]).trim();
        return !etimPins.has(pdiPin);
      });

      // --- Resposta Final ---
      // Retorna um objeto JSON no formato { "data": [...] } que o seu frontend espera
      return res.status(200).json({ data: chassisFaltantes });

    } catch (e) {
      console.error("Erro interno na API /api/compare:", e);
      // Retorna um JSON de erro claro para o frontend
      return res.status(400).json({ error: e.message || "Ocorreu um erro desconhecido." });
    }
  });
}
