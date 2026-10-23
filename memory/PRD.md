# Orçamento da Família — PRD

## Original problem
Transform the "Orçamento do Casal" Excel spreadsheet (Renda, Despesas Fixas, Despesas Variáveis, Saldo/Situação/% gasto, Dashboard anual + "para onde vai o dinheiro") into a mobile app for a whole family (user, wife, daughter, mother — all with income). Must be very intuitive; mother has low literacy.

## User choices
- Emergent Google login; family shared via 6-char invite code
- Editable members (Eu, Esposa, Filha, Mãe) with monthly income
- Variable expenses = monthly total per category (like the spreadsheet)
- Spreadsheet categories seeded, values zero

## Architecture
- Backend FastAPI + MongoDB (server.py): users, user_sessions, families, members, categories (kind: income_extra/fixed/variable), entries (per year/month override or value)
- Calc: income = member default or month override + extra; fixed = default or override; variable = month entry; balance, status POSITIVO/NEGATIVO, pct
- Frontend Expo Router: login, onboarding (create/join), tabs Início / Contas / Ano / Família, modals editar / membro / categoria. Nunito font, large touch targets, MaterialDesignIcons.

## Implemented (Oct 2026)
- Google auth, family create/join, seeded members+23 categories
- Month summary, entry editing ("todo mês" vs "só neste mês", reset), add/edit/delete categories & members
- Year dashboard (bar chart, month rows, breakdown)
- Tested: backend 14/14, frontend flows pass

## Iteration 2 (Oct 2026)
- Copiar mês anterior (POST /api/month/{y}/{m}/copy-previous) – button on Contas tab
- Export year: Excel (openpyxl, /api/export/{y}.xlsx, ?token= allowed on export only) + PDF (expo-print from /api/export/{y}/html), shared via expo-sharing on native
- Metas de economia: goals + monthly deposits, progress bars, monthly chart (/metas, /meta)
- Gastos por pessoa: categories have member_id owner (cards seeded/migrated), /api/people/{y}, /pessoas screen
- Tested: backend 31/31, frontend flows pass

## Iteration 3 (Oct 2026)
- Alerta de gastos: home banner when spending ≥90% (ATENÇÃO) or >100% (CUIDADO) of month income
- Contas a vencer: categories have due_day; GET /api/bills/upcoming (next 7 days + unpaid overdue), PUT /api/bills/paid; home "Contas desta semana" card with "Paguei" button; due-day grid on categoria screen
- Tested: backend 15/15 new tests, frontend flows pass

## Backlog
- P1: Monthly reminder to log expenses
- P2: Dark mode
