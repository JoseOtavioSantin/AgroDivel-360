// /assets/js/Formularios/os.js

import { garantirAutenticacao } from '/assets/js/auth-guard.js';
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDcjPa9jXsCCu6lNc1fjVg4Bzz1toKWAGY",
  authDomain: "agro-divel.firebaseapp.com",
  projectId: "agro-divel",
  storageBucket: "agro-divel.firebasestorage.app",
  messagingSenderId: "583977436505",
  appId: "1:583977436505:web:3754ec029aebb3d9d67848"
};

let app, db;
let todasAlocacoes = [];
let todasFerramentas = [];
let tomSelectOS;

// ==================================================================
// FUNÇÃO DE INICIALIZAÇÃO
// ==================================================================
async function iniciarPagina() {
    try {
        await garantirAutenticacao();

        if (!getApps().length) { 
            app = initializeApp(firebaseConfig); 
        } else { 
            app = getApp(); 
        }
        db = getFirestore(app);

        Swal.fire({ 
            title: 'Carregando dados...', 
            text: 'Buscando alocações e ferramentas.', 
            allowOutsideClick: false, 
            didOpen: () => Swal.showLoading() 
        });

        const [alocacoesSnap, ferramentasSnap] = await Promise.all([
            getDocs(collection(db, "alocacoes")),
            getDocs(collection(db, "ferramentas"))
        ]);

        todasAlocacoes = alocacoesSnap.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data() 
        }));
        
        todasFerramentas = ferramentasSnap.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data() 
        }));

        Swal.close();

        // Filtra as OSs únicas e garante que o campo ordemServico exista
        const osUnicas = [...new Set(todasAlocacoes
            .map(a => a.ordemServico)
            .filter(os => os && os.trim() !== '')
        )];
        
        const opcoesOS = osUnicas.map(os => ({
            value: os,
            text: `OS: ${os}`
        }));

        // Inicializa TomSelect
        tomSelectOS = new TomSelect('#os-select', {
            create: false,
            sortField: { field: "text", direction: "asc" },
            dropdownParent: 'body',
            options: opcoesOS,
            onChange: function(value) {
                if (value) {
                    document.getElementById('btn-gerar-pdf').disabled = false;
                    exibirPreviewPDF(value);
                } else {
                    document.getElementById('btn-gerar-pdf').disabled = true;
                    document.getElementById('pdf-preview').style.display = 'none';
                }
            }
        });

        // Adiciona event listener para o botão
        document.getElementById('btn-gerar-pdf').addEventListener('click', gerarPDF);

    } catch (error) {
        console.error("Falha na inicialização da página:", error);
        Swal.fire('Erro Crítico', 'Não foi possível carregar os dados da página. Verifique o console para mais detalhes.', 'error');
    }
}

// ==================================================================
// FUNÇÃO PARA EXIBIR O PREVIEW DO PDF
// ==================================================================
function exibirPreviewPDF(os) {
    const alocacoesDaOS = todasAlocacoes.filter(a => a.ordemServico === os);
    
    if (alocacoesDaOS.length === 0) {
        document.getElementById('pdf-preview').innerHTML = '<p>Nenhuma alocação encontrada para esta OS.</p>';
        document.getElementById('pdf-preview').style.display = 'block';
        return;
    }

    // Pega os dados da primeira alocação para os detalhes
    const primeiraAlocacao = alocacoesDaOS[0];
    const tecnico = primeiraAlocacao.funcionario || 'Não informado';
    const responsavel = primeiraAlocacao.responsavelLancamento || 'Não informado';
    
    // Converte data do Firebase (Timestamp) para formato legível
    let dataAlocacao = 'Data não disponível';
    if (primeiraAlocacao.dataAlocacao) {
        if (primeiraAlocacao.dataAlocacao.toDate) {
            dataAlocacao = primeiraAlocacao.dataAlocacao.toDate().toLocaleDateString('pt-BR');
        } else if (primeiraAlocacao.dataAlocacao instanceof Date) {
            dataAlocacao = primeiraAlocacao.dataAlocacao.toLocaleDateString('pt-BR');
        }
    }

    let listaItensHTML = '<table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 11px;">';
    listaItensHTML += '<tr style="background-color: #f8f9fa;">';
    listaItensHTML += '<th style="padding: 6px; text-align: left; border-bottom: 1px solid #ddd;">Código</th>';
    listaItensHTML += '<th style="padding: 6px; text-align: left; border-bottom: 1px solid #ddd;">Descrição</th>';
    listaItensHTML += '<th style="padding: 6px; text-align: left; border-bottom: 1px solid #ddd;">Localização</th>';
    listaItensHTML += '<th style="padding: 6px; text-align: center; border-bottom: 1px solid #ddd;">Qtd</th>';
    listaItensHTML += '</tr>';
    
    alocacoesDaOS.forEach(alocacao => {
        const ferramenta = todasFerramentas.find(f => f.id === alocacao.ferramentaId);
        const codigo = ferramenta ? (ferramenta.codigo || 'N/A') : 'N/A';
        const descricao = ferramenta ? (ferramenta.descricao || 'Descrição não disponível') : 'Ferramenta não encontrada';
        const localizacao = ferramenta ? (ferramenta.localizacao || '-') : '-';
        const quantidade = alocacao.quantidade || 1;
        
        listaItensHTML += `<tr>`;
        listaItensHTML += `<td style="padding: 6px; border-bottom: 1px solid #eee;">${codigo}</td>`;
        listaItensHTML += `<td style="padding: 6px; border-bottom: 1px solid #eee;">${descricao}</td>`;
        listaItensHTML += `<td style="padding: 6px; border-bottom: 1px solid #eee;">${localizacao}</td>`;
        listaItensHTML += `<td style="padding: 6px; text-align: center; border-bottom: 1px solid #eee;">${quantidade}</td>`;
        listaItensHTML += `</tr>`;
    });
    listaItensHTML += '</table>';

    const previewHTML = `
        <div style="min-height: 260mm; display: flex; flex-direction: column; position: relative;">
            <div style="flex: 0 0 auto;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #e0e0e0;">
                    <div>
                        <img src="/assets/images/logoPDF.png" alt="Logo" style="height: 150px; max-width: 200px;">
                    </div>
                    <div style="text-align: right;">
                        <h2 style="margin: 0 0 2px 0; font-size: 16px; color: #333;">Relatório de Alocação</h2>
                        <p style="margin: 0; font-size: 12px; color: #666;">OS: <strong>${os}</strong></p>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0; font-size: 11px;">
                    <div><strong>Técnico:</strong> ${tecnico}</div>
                    <div><strong>Data:</strong> ${dataAlocacao}</div>
                    <div><strong>Responsável:</strong> ${responsavel}</div>
                </div>
                
                <h3 style="margin: 15px 0 8px 0; font-size: 13px; border-bottom: 1px solid #eee; padding-bottom: 4px;">Itens Alocados</h3>
                ${listaItensHTML}
            </div>
            
            <div style="margin-top: auto; padding-top: 40mm;">
                <div style="text-align: center;">
                    <div style="border-top: 1px solid #000; width: 200px; margin: 0 auto; padding-top: 4px;">
                        <p style="margin: 0; font-size: 10px;">Assinatura do Mecânico</p>
                    </div>
                </div>
                
                <div style="margin-top: 10px; text-align: center; font-size: 9px; color: #666; border-top: 1px solid #eee; padding-top: 8px;">
                    <p style="margin: 0;">Documento gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</p>
                </div>
            </div>
        </div>
    `;

    document.getElementById('pdf-preview').innerHTML = previewHTML;
    document.getElementById('pdf-preview').style.display = 'block';
}
// ==================================================================
// FUNÇÃO PARA GERAR E BAIXAR O PDF
// ==================================================================
function gerarPDF() {
    const os = tomSelectOS.getValue();
    if (!os) {
        return Swal.fire("Atenção", "Selecione uma Ordem de Serviço.", "warning");
    }

    if (typeof html2pdf === 'undefined') {
        return Swal.fire('Erro Crítico', 'A biblioteca html2pdf.js não foi carregada.', 'error');
    }

    const element = document.getElementById('pdf-preview');
    const filename = `Alocacao_OS_${os}.pdf`;

    const opt = {
        margin: [10, 10, 10, 10],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
            scale: 2,
            useCORS: true,
            logging: false
        },
        jsPDF: { 
            unit: 'mm', 
            format: 'a4', 
            orientation: 'portrait',
            compress: true
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    Swal.fire({ 
        title: 'Gerando PDF...', 
        text: 'Aguarde um momento.', 
        allowOutsideClick: false, 
        didOpen: () => Swal.showLoading() 
    });

    html2pdf().set(opt).from(element).save().then(() => {
        Swal.close();
        Swal.fire('Sucesso!', 'PDF gerado e download iniciado.', 'success');
    }).catch(error => {
        Swal.close();
        Swal.fire('Erro!', 'Falha ao gerar o PDF: ' + error.message, 'error');
    });
}

// Inicializa a página quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', iniciarPagina);