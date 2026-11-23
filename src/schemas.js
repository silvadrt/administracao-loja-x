// ============================================================
// Validação de todos os dados que entram no sistema (zod).
// Cada módulo tem seu esquema; campos opcionais vazios são
// convertidos em null de forma segura.
// ============================================================
import { z } from "zod";

export const ROLES = ["admin", "veneravel", "secretario", "chanceler", "tesoureiro", "fraternidade", "irmao"];
export const BROTHER_STATUS = ["ativo", "afastado", "visitante", "desligado", "outro"];
export const ATTENDANCE_STATUS = ["presente", "ausente", "justificado", "visitante"];
export const CONTRIBUTION_TYPES = ["mensalidade", "taxa_extra", "tronco", "doacao", "outro"];
export const CONTRIBUTION_STATUS = ["pendente", "pago", "isento", "cancelado"];
export const COMMUNICATION_STATUS = ["rascunho", "preparado", "enviado", "falhou"];

const texto = (max) => z.string().trim().min(2).max(max);

// Preprocessador: mantém undefined (campo não enviado),
// vira null quando vazio — para PATCH parcial funcionar bem.
const vazioViraNulo = (v) => (v === undefined ? undefined : v === null || v === "" ? null : v);

const textoOpcional = (max) =>
  z.preprocess(vazioViraNulo, z.string().trim().max(max).nullable().optional());
const dataOpcional = z.preprocess(vazioViraNulo, z.string().date().nullable().optional());
const emailOpcional = z.preprocess(vazioViraNulo, z.string().trim().email().max(254).nullable().optional());
const uuidOpcional = z.preprocess(vazioViraNulo, z.string().uuid().nullable().optional());
const mesReferencia = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use o formato AAAA-MM (ex.: 2026-10).");

// ---------- Regra de senha (única para todo o sistema) ----------
// Mínimo de 8 caracteres, com pelo menos uma letra, um número e um símbolo.
// Senhas muito comuns são recusadas. (A proteção real vem do bcrypt +
// limite de tentativas; o tamanho é a margem de segurança extra.)
export const SENHA_MIN = 8;
export const SENHA_REGRA_TEXTO =
  "Mínimo de 8 caracteres, com pelo menos uma letra, um número e um símbolo (ex.: ! @ # $ %).";

const SENHAS_OBVIAS = new Set([
  "senha123", "senha1234", "senha@123", "senha123!", "password", "password1",
  "12345678", "123456789", "qwerty123", "abc12345", "maconaria", "chancelaria",
  "lojax123", "admin123", "brasil123",
]);

export const senhaForte = z
  .string()
  .min(SENHA_MIN, `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`)
  .max(200)
  .refine((s) => /\p{L}/u.test(s), "A senha precisa ter pelo menos uma letra.")
  .refine((s) => /\p{N}/u.test(s), "A senha precisa ter pelo menos um número.")
  .refine(
    (s) => /[^\p{L}\p{N}]/u.test(s),
    "A senha precisa ter pelo menos um símbolo (ex.: ! @ # $ %).",
  )
  .refine((s) => !SENHAS_OBVIAS.has(s.toLowerCase()), "Essa senha é muito comum. Escolha outra.");

// ---------- Autenticação ----------
export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(20).max(300),
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1).max(200),
  new_password: senhaForte,
});

export const setupAdminSchema = z.object({
  full_name: texto(120),
  email: z.string().trim().email().max(254),
  password: senhaForte,
});

// ---------- Usuários ----------
export const userCreateSchema = z.object({
  full_name: texto(120),
  email: z.string().trim().email().max(254),
  password: senhaForte,
  role: z.enum(ROLES),
  brother_id: uuidOpcional,
});

export const userUpdateSchema = z.object({
  full_name: texto(120).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  brother_id: uuidOpcional,
});

export const resetPasswordSchema = z.object({ new_password: senhaForte });

// ---------- Loja ----------
export const lodgeUpdateSchema = z.object({
  official_name: texto(200).optional(),
  power_name: z.string().trim().max(120).optional(),
  address: textoOpcional(300).optional(),
  email: emailOpcional.optional(),
  phone: textoOpcional(40).optional(),
  logo_url: textoOpcional(500).optional(),
  founded_on: dataOpcional.optional(),
});

// ---------- Irmãos ----------
export const brotherCreateSchema = z.object({
  full_name: texto(160),
  cim: textoOpcional(60),
  birth_date: dataOpcional,
  degree: textoOpcional(80),
  address: textoOpcional(300),
  phone: textoOpcional(40),
  email: emailOpcional,
  status: z.enum(BROTHER_STATUS).optional(),
  notes: textoOpcional(2000),
});
export const brotherUpdateSchema = brotherCreateSchema.partial();

// ---------- Familiares ----------
export const familyCreateSchema = z.object({
  full_name: texto(160),
  relationship: texto(60),
  birth_date: dataOpcional,
  address: textoOpcional(300),
  phone: textoOpcional(40),
  email: emailOpcional,
});
export const familyUpdateSchema = familyCreateSchema.partial();

// ---------- Venerância: quadro de oficiais, cargos e mandato ----------
// Os cargos seguem a ordem usada nas sessões: as três luzes, os cargos
// oficiais e os oficiais complementares.
export const CATEGORIAS_CARGO = [
  { key: "tres_luzes", label: "As Três Luzes", descricao: "Os três dirigentes da Loja." },
  { key: "oficiais", label: "Cargos Oficiais", descricao: "Oficiais nomeados que assinam e conduzem os trabalhos." },
  { key: "complementares", label: "Oficiais Complementares", descricao: "Apoio ao cerimonial, à harmonia e ao Templo." },
];

export const CARGOS = [
  { key: "veneravel_mestre", label: "Venerável Mestre", categoria: "tres_luzes" },
  { key: "primeiro_vigilante", label: "1º Vigilante", categoria: "tres_luzes" },
  { key: "segundo_vigilante", label: "2º Vigilante", categoria: "tres_luzes" },
  { key: "orador", label: "Orador", categoria: "oficiais" },
  { key: "secretario", label: "Secretário", categoria: "oficiais" },
  { key: "tesoureiro", label: "Tesoureiro", categoria: "oficiais" },
  { key: "mestre_cerimonias", label: "Mestre de Cerimônias", categoria: "oficiais" },
  { key: "hospitaleiro", label: "Hospitaleiro", categoria: "oficiais" },
  { key: "primeiro_diacono", label: "1º Diácono", categoria: "complementares" },
  { key: "segundo_diacono", label: "2º Diácono", categoria: "complementares" },
  { key: "cobridor_interno", label: "Guarda do Templo / Cobridor Interno", categoria: "complementares" },
  { key: "cobridor_externo", label: "Cobridor Externo", categoria: "complementares" },
  { key: "mestre_harmonia", label: "Mestre de Harmonia", categoria: "complementares" },
  { key: "mestre_banquete", label: "Mestre de Banquete", categoria: "complementares" },
];

export const CARGO_KEYS = CARGOS.map((c) => c.key);
export const CARGO_POR_CHAVE = Object.fromEntries(CARGOS.map((c) => [c.key, c]));

export const officerSetSchema = z.object({
  cargo: z.enum(CARGO_KEYS),
  brother_id: uuidOpcional,
  term_start: dataOpcional,
  term_end: dataOpcional,
});
export const officerUpdateSchema = officerSetSchema.partial();

export const mandateCreateSchema = z.object({
  label: texto(40),
  started_on: z.preprocess(vazioViraNulo, z.string().date().nullable().optional()),
  notes: textoOpcional(300),
});

// ---------- Secretaria: livro de atas ----------
export const MINUTE_STATUS = ["rascunho", "aprovada", "enviada", "arquivada"];
export const minuteCreateSchema = z.object({
  number: textoOpcional(30),
  title: texto(200),
  session_date: z.string().date(),
  session_type: textoOpcional(60),
  degree: textoOpcional(40),
  body: textoOpcional(20000),
  decisions: textoOpcional(8000),
  sent_to_gob_at: dataOpcional,
  gob_protocol: textoOpcional(60),
  status: z.enum(MINUTE_STATUS).optional(),
});
export const minuteUpdateSchema = minuteCreateSchema.partial();
export const minuteArchiveSchema = z.object({ archive_note: textoOpcional(300) });

// ---------- Tesouraria: movimento de caixa (saídas e entradas) ----------
export const CASH_CATEGORIES = [
  { key: "obras", label: "Pagamento de obras", saida: true },
  { key: "agua", label: "Água", saida: true },
  { key: "luz", label: "Luz", saida: true },
  { key: "gob", label: "GOB", saida: true },
  { key: "gobgo", label: "GOB-GO", saida: true },
  { key: "retirada", label: "Retirada do caixa", saida: true },
  { key: "doacao", label: "Doação", saida: false },
  { key: "beneficencia", label: "Beneficência (remédio, exame, cesta básica...)", saida: true },
  { key: "retirada_tronco", label: "Retirada do Tronco (aprovada em ata)", saida: true },
  { key: "internet", label: "Internet", saida: true },
  { key: "aluguel", label: "Aluguel", saida: true },
  { key: "tronco", label: "Tronco de Beneficência", saida: false },
  { key: "outro", label: "Outro", saida: false },
];

// ---------- Fundos da Tesouraria ----------
// O Tronco de Beneficência faz parte do saldo da Loja, mas tem saldo
// próprio: entra pelo tronco (contribuição ou entrada avulsa) e só sai
// pela beneficência. Todo o resto é o fundo geral da Loja.
export const TRONCO_ENTRADA = "tronco";
// Saídas do tronco: a beneficência (ajuda a um irmão, cesta básica...) ou
// uma retirada específica aprovada em ata. Nunca despesas gerais da Loja.
export const TRONCO_SAIDAS = ["beneficencia", "retirada_tronco"];
export const CASH_CATEGORY_KEYS = CASH_CATEGORIES.map((c) => c.key);
export const CASH_KINDS = ["entrada", "saida"];

const mesOpcional = z.preprocess(vazioViraNulo, mesReferencia.nullable().optional());
const cashBase = z.object({
  kind: z.enum(CASH_KINDS),
  category: z.enum(CASH_CATEGORY_KEYS),
  description: texto(200),
  amount: z.coerce.number().positive("Informe um valor maior que zero.").max(1_000_000),
  movement_date: z.string().date(),
  reference_month: mesOpcional,
  approval_ref: textoOpcional(120),
  notes: textoOpcional(500),
});

/**
 * Regras de coerência do lançamento (valem na criação e na edição, sobre o
 * registro já completo): entrada de tronco é entrada; beneficência é saída;
 * retirada (do saldo da Loja ou do Tronco) exige a ata que a aprovou.
 */
export function problemaLancamento(m) {
  if (m.category === TRONCO_ENTRADA && m.kind !== "entrada") return "O Tronco de Beneficência só pode ser lançado como entrada.";
  if (TRONCO_SAIDAS.includes(m.category) && m.kind !== "saida")
    return "A beneficência e a retirada do Tronco só podem ser lançadas como saída.";
  if ((m.category === "retirada" || m.category === "retirada_tronco") && !m.approval_ref)
    return "Informe a ata que aprovou a retirada (ex.: Ata nº 12/2026).";
  return null;
}

export const cashCreateSchema = cashBase;
export const cashUpdateSchema = cashBase.partial();

// ---------- Eventos / Sessões ----------
export const eventCreateSchema = z.object({
  title: texto(160),
  event_type: texto(60),
  starts_at: z.string().datetime({ offset: true, message: "Data/hora inválida." }),
  location: textoOpcional(200),
  description: textoOpcional(2000),
});
export const eventUpdateSchema = eventCreateSchema.partial();

export const attendanceBulkSchema = z.object({
  entries: z
    .array(
      z.object({
        brother_id: z.string().uuid(),
        status: z.enum(ATTENDANCE_STATUS),
        notes: textoOpcional(300),
      }),
    )
    .min(1, "Envie ao menos um registro de presença.")
    .max(400),
});

// ---------- Visitações ----------
export const visitCreateSchema = z.object({
  visit_type: z.enum(["realizada", "recebida"]),
  brother_name: texto(160),
  lodge_name: textoOpcional(160),
  power_name: textoOpcional(120),
  visit_date: z.string().date(),
  notes: textoOpcional(1000),
});
export const visitUpdateSchema = visitCreateSchema.partial();

// ---------- Fraternidade Feminina ----------
export const fraternityCreateSchema = z.object({
  full_name: texto(160),
  birth_date: dataOpcional,
  phone: textoOpcional(40),
  email: emailOpcional,
  role_name: textoOpcional(80),
  related_brother_id: uuidOpcional,
  active: z.boolean().optional(),
});
export const fraternityUpdateSchema = fraternityCreateSchema.partial();

// Evento agendado pela própria Fraternidade (a Secretaria é avisada).
export const fraternityEventSchema = z.object({
  title: texto(160),
  starts_at: z.string().datetime({ offset: true, message: "Data/hora inválida." }),
  location: textoOpcional(200),
  description: textoOpcional(2000),
});

// ---------- Contribuições ----------
export const contributionCreateSchema = z.object({
  contributor_name: textoOpcional(160),
  brother_id: uuidOpcional,
  reference_month: mesReferencia,
  contribution_type: z.enum(CONTRIBUTION_TYPES),
  description: textoOpcional(160),
  amount: z.coerce.number().positive("Informe um valor maior que zero.").max(1_000_000),
  due_date: dataOpcional,
  status: z.enum(CONTRIBUTION_STATUS).optional(),
  notes: textoOpcional(500),
});
export const contributionUpdateSchema = contributionCreateSchema.partial();

export const generateMonthSchema = z.object({
  reference_month: mesReferencia,
  amount: z.coerce.number().positive("Informe um valor maior que zero.").max(100_000),
  due_day: z.coerce.number().int().min(1).max(28).optional(),
});

// Cobrança em lote (taxa extra, doação ou tronco combinados em loja):
// para todos os irmãos ativos ou só para os escolhidos.
export const generateChargeSchema = z.object({
  contribution_type: z.enum(["taxa_extra", "doacao", "tronco", "outro"]),
  description: texto(160),
  reference_month: mesReferencia,
  amount: z.coerce.number().positive("Informe um valor maior que zero.").max(100_000),
  due_date: dataOpcional,
  brother_ids: z.array(z.string().uuid()).max(400).optional(),
});

// ---------- Secretaria: envios ao GOB / GOB-GO ----------
export const GOB_DOC_TYPES = [
  { key: "ata", label: "Ata aprovada" },
  { key: "iniciacao", label: "Pedido de iniciação" },
  { key: "filiacao", label: "Pedido de filiação" },
  { key: "desligamento", label: "Pedido de desligamento" },
  { key: "transferencia", label: "Pedido de transferência" },
  { key: "votacao_diretoria", label: "Resultado da votação da diretoria" },
  { key: "kit_placet", label: "Kit placet" },
  { key: "outro", label: "Outro (e-mail, ofício...)" },
];
export const GOB_STATUS = ["a_enviar", "enviado", "concluido", "devolvido"];
export const gobCreateSchema = z.object({
  doc_type: z.enum(GOB_DOC_TYPES.map((t) => t.key)),
  title: texto(200),
  power: z.enum(["GOB", "GOB-GO"]).optional(),
  status: z.enum(GOB_STATUS).optional(),
  due_date: dataOpcional,
  sent_on: dataOpcional,
  protocol: textoOpcional(80),
  notes: textoOpcional(1000),
});
export const gobUpdateSchema = gobCreateSchema.partial();

// Pagamento parcial (acordo com o irmão): valor recebido agora.
export const partialPaymentSchema = z.object({
  amount_paid: z.coerce.number().positive("Informe um valor maior que zero.").max(1_000_000),
  notes: textoOpcional(300),
});

// Remoção das mensalidades de um mês (somente administrador).
export const removeMonthSchema = z.object({
  reference_month: mesReferencia,
});

// ---------- Comunicados ----------
export const communicationCreateSchema = z.object({
  title: texto(160),
  message: texto(4000),
  channel: z.enum(["whatsapp"]).optional(),
  status: z.enum(COMMUNICATION_STATUS).optional(),
});
export const communicationUpdateSchema = communicationCreateSchema.partial();
