# CSV Format Guide - Lubrificantes Analysis

This document describes the expected CSV file formats for the Lubrificantes (Lubricants) analysis module.

## General Requirements

- **Encoding**: Files should be in UTF-8 encoding. The system will attempt ISO-8859-1 as a fallback if UTF-8 fails.
- **Delimiter**: Semicolon (`;`) is used as the column delimiter.
- **Line Endings**: Standard line breaks (`\n` or `\r\n`) are supported.
- **Header**: Both CSV types require a header row.

## 1. Sales CSV Format (`processarCSV`)

### Purpose
Import sales data for lubricants across different branches (filiais).

### Expected Columns (Semicolon-separated)

| Column Index | Field Name | Description | Example |
|--------------|------------|-------------|---------|
| 0 | Filial | Branch number (2, 6, or 7) | `2` |
| 1 | Data | Date in DD/MM/YYYY format | `15/01/2025` |
| 2 | Grupo | Product group | `LUBRIFICANTES` |
| 3 | Número NF | Invoice number | `NF-12345` |
| 4 | Código Produto | Product code | `NH410H` |
| 5 | Descrição | Product description | `ÓLEO TRANSMISSÃO 20L` |
| 6 | Quantidade NF | Invoice quantity | `5` or `5,5` |
| 7 | Unidade NF | Invoice unit | `UN` |
| 8 | Quantidade Convertida | Converted quantity | `5` or `5,5` |
| 9 | Unidade | Unit | `UN` |

### Header Requirements
The header row must contain the following text:
- `Filial`
- `Data`
- `Descri` (partial match for "Descrição")

### Example CSV (Sales)
```csv
Filial;Data;Grupo;Número NF;Código Produto;Descrição;Quantidade NF;Unidade NF;Quantidade Convertida;Unidade
2;15/01/2025;LUBRIFICANTES;NF-12345;NH410H;ÓLEO TRANSMISSÃO 20L;5;UN;5;UN
6;16/01/2025;LUBRIFICANTES;NF-12346;76176R61BR;ÓLEO HIDRÁULICO 20L;3;UN;3;UN
```

### Validation Rules
- Minimum 6 columns required
- Filial must be one of: 2, 6, or 7
- Filial must be numeric
- Código Produto (column 4) must not be empty
- Numeric values in columns 6 and 8 can use comma (`,`) or period (`.`) as decimal separator

## 2. Stock CSV Format (`processarCSVEstoque`)

### Purpose
Import monthly stock data for lubricants inventory management.

### Expected Columns (Semicolon-separated)

| Column Index | Field Name | Description | Example |
|--------------|------------|-------------|---------|
| 0 | Filial | Branch number (2, 6, or 7) | `2` |
| 2 | Código Produto | Product code | `NH410H` |
| 3 | Descrição | Product description | `ÓLEO TRANSMISSÃO 20L` |
| 4 | Grupo | Product group | `LUBRIFICANTES` |
| 5 | Descrição Grupo | Group description | `ÓLEOS E LUBRIFICANTES` |
| 6 | Prateleira | Shelf location | `A-12` |
| 11 | Estoque Fiscal | Fiscal stock quantity | `150` |
| 12 | Valor Estoque | Stock value | `15000,50` |

### Example CSV (Stock)
```csv
Filial;;Código Produto;Descrição;Grupo;Descrição Grupo;Prateleira;;;;;Estoque Fiscal;Valor Estoque
2;;NH410H;ÓLEO TRANSMISSÃO 20L;LUBRIFICANTES;ÓLEOS E LUBRIFICANTES;A-12;;;;;150;15000,50
6;;76176R61BR;ÓLEO HIDRÁULICO 20L;LUBRIFICANTES;ÓLEOS E LUBRIFICANTES;B-03;;;;;100;12000,00
```

### Validation Rules
- Minimum 13 columns required
- Filial must be one of: 2, 6, or 7
- Código Produto must not be empty
- Estoque Fiscal (column 11) must be a positive integer
- Lines starting with "TOTAL" are automatically skipped

### User Prompts
When importing stock CSV, the system will prompt for:
1. **Reference Month** (YYYY-MM format): e.g., `2025-01`
2. **Reference Date** (YYYY-MM-DD format): e.g., `2025-01-31`

## Error Messages

### Common Errors and Solutions

| Error Message | Cause | Solution |
|---------------|-------|----------|
| "O arquivo CSV está vazio" | File contains no data or only whitespace | Ensure the file contains actual CSV data |
| "O arquivo CSV deve conter pelo menos um cabeçalho e uma linha de dados" | File has less than 2 lines | Add header row and at least one data row |
| "Cabeçalho do CSV não encontrado" | Header doesn't contain required fields | Ensure header contains "Filial", "Data", and "Descri" for sales CSV |
| "número insuficiente de colunas" | Row has fewer columns than required | Check delimiter (`;`) and ensure all columns are present |
| "Nenhum dado válido encontrado" | No valid rows after filtering | Check that Filial values are 2, 6, or 7 and data is properly formatted |

## Processing Statistics

After successful import, the system displays:
- Number of successfully processed lines
- Number of invalid/skipped lines
- Number of duplicate records (sales CSV only)

## Technical Notes

### Encoding Detection
The system attempts to read files in the following order:
1. UTF-8 (preferred)
2. ISO-8859-1 (fallback for legacy files)

### Number Parsing
- Both comma (`,`) and period (`.`) are accepted as decimal separators
- Example: `5,5` and `5.5` are both valid

### Volume Conversion
The system automatically converts product quantities to liters based on:
- Product code mapping (hardcoded conversions)
- Heuristic detection from product description (e.g., "20L", "500ML")
- Default value of 1 liter if no mapping is found

### Duplicate Prevention (Sales CSV)
The system prevents duplicate entries using a unique key composed of:
- Filial
- Data
- Número NF
- Código Produto

## Changelog

### 2025-12-30
- Changed default encoding from ISO-8859-1 to UTF-8
- Added comprehensive validation for CSV structure
- Fixed bug in litros calculation (`litrosPorUnidade` undefined reference)
- Enhanced error messages with specific guidance
- Added processing statistics logging
- Added JSDoc documentation to functions
