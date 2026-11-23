-- ============================================================
-- Administração Loja X — estrutura do banco de dados
-- PostgreSQL 13+ (Neon, Supabase, local...)
-- Este arquivo é idempotente: pode ser executado várias vezes
-- sem apagar dados existentes.
-- ============================================================

-- ---------- Loja ----------
CREATE TABLE IF NOT EXISTS lodge (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  official_name TEXT NOT NULL DEFAULT 'Administração Loja X',
  power_name   TEXT NOT NULL DEFAULT '',
  address      TEXT,
  email        TEXT,
  phone        TEXT,
  logo_url     TEXT,
  founded_on   DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Usuários do sistema (diretoria) ----------
CREATE TABLE IF NOT EXISTS app_users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           TEXT NOT NULL,
  email               TEXT NOT NULL UNIQUE,
  password_hash       TEXT NOT NULL,
  role                TEXT NOT NULL CHECK (role IN ('admin','veneravel','secretario','chanceler','tesoureiro','fraternidade')),
  active              BOOLEAN NOT NULL DEFAULT true,
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Tokens de renovação de sessão ----------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id);

-- ---------- Irmãos ----------
CREATE TABLE IF NOT EXISTS brothers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name  TEXT NOT NULL,
  cim        TEXT UNIQUE,
  birth_date DATE,
  degree     TEXT,
  address    TEXT,
  phone      TEXT,
  email      TEXT,
  status     TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','afastado','visitante','desligado','outro')),
  notes      TEXT,
  created_by UUID REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brothers_name_idx ON brothers(lower(full_name));
CREATE INDEX IF NOT EXISTS brothers_status_idx ON brothers(status);

-- ---------- Familiares ----------
CREATE TABLE IF NOT EXISTS family_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brother_id  UUID NOT NULL REFERENCES brothers(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  relationship TEXT NOT NULL,
  birth_date  DATE,
  address     TEXT,
  phone       TEXT,
  email       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS family_brother_idx ON family_members(brother_id);

-- ---------- Cargos / Diretoria ----------
CREATE TABLE IF NOT EXISTS lodge_officers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brother_id  UUID REFERENCES brothers(id) ON DELETE SET NULL,
  office_name TEXT NOT NULL,
  term_start  DATE,
  term_end    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Eventos / Sessões ----------
CREATE TABLE IF NOT EXISTS events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  starts_at   TIMESTAMPTZ NOT NULL,
  location    TEXT,
  description TEXT,
  created_by  UUID REFERENCES app_users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_starts_idx ON events(starts_at);

-- ---------- Presença em eventos ----------
CREATE TABLE IF NOT EXISTS attendance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  brother_id  UUID NOT NULL REFERENCES brothers(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('presente','ausente','justificado','visitante')),
  notes       TEXT,
  recorded_by UUID REFERENCES app_users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, brother_id)
);

-- ---------- Visitações ----------
CREATE TABLE IF NOT EXISTS visits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_type  TEXT NOT NULL CHECK (visit_type IN ('realizada','recebida')),
  brother_name TEXT NOT NULL,
  lodge_name  TEXT,
  power_name  TEXT,
  visit_date  DATE NOT NULL,
  notes       TEXT,
  created_by  UUID REFERENCES app_users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visits_date_idx ON visits(visit_date);

-- ---------- Fraternidade Feminina ----------
CREATE TABLE IF NOT EXISTS fraternity_members (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name         TEXT NOT NULL,
  birth_date        DATE,
  phone             TEXT,
  email             TEXT,
  role_name         TEXT,
  related_brother_id UUID REFERENCES brothers(id) ON DELETE SET NULL,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Contribuições / Financeiro ----------
CREATE TABLE IF NOT EXISTS contributions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_name TEXT NOT NULL,
  brother_id       UUID REFERENCES brothers(id) ON DELETE SET NULL,
  reference_month  TEXT NOT NULL,
  contribution_type TEXT NOT NULL CHECK (contribution_type IN ('mensalidade','taxa_extra','tronco','doacao','outro')),
  amount           NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  due_date         DATE,
  status           TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','isento','cancelado')),
  paid_at          TIMESTAMPTZ,
  notes            TEXT,
  created_by       UUID REFERENCES app_users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contributions_ref_idx ON contributions(reference_month);
CREATE INDEX IF NOT EXISTS contributions_status_idx ON contributions(status);
-- O índice que evita mensalidade duplicada (mesmo irmão/mês) fica na
-- migração v0.4.0, no fim deste arquivo.

-- ---------- Comunicados (WhatsApp etc.) ----------
CREATE TABLE IF NOT EXISTS communications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  channel    TEXT NOT NULL DEFAULT 'whatsapp',
  status     TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','preparado','enviado','falhou')),
  created_by UUID REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at    TIMESTAMPTZ
);

-- ---------- Mandatos (renovação do quadro de oficiais) ----------
CREATE TABLE IF NOT EXISTS mandates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT NOT NULL,
  started_on  DATE NOT NULL DEFAULT CURRENT_DATE,
  ended_on    DATE,
  notes       TEXT,
  created_by  UUID REFERENCES app_users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mandates_aberto_idx ON mandates(ended_on);

-- Campos do quadro de oficiais por mandato (o cargo passa a ser catalogado).
ALTER TABLE lodge_officers ADD COLUMN IF NOT EXISTS cargo TEXT;
ALTER TABLE lodge_officers ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE lodge_officers ADD COLUMN IF NOT EXISTS mandate_id UUID REFERENCES mandates(id) ON DELETE SET NULL;
ALTER TABLE lodge_officers ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
-- Um irmão não ocupa o mesmo cargo duas vezes no mesmo mandato:
CREATE UNIQUE INDEX IF NOT EXISTS lodge_officers_cargo_unico
  ON lodge_officers(mandate_id, cargo)
  WHERE mandate_id IS NOT NULL AND cargo IS NOT NULL AND active = true;

-- ---------- Livro de Atas (Secretaria) ----------
CREATE TABLE IF NOT EXISTS minutes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number         TEXT,
  title          TEXT NOT NULL,
  session_date   DATE NOT NULL,
  session_type   TEXT,
  degree         TEXT,
  body           TEXT,
  decisions      TEXT,
  sent_to_gob_at DATE,
  gob_protocol   TEXT,
  status         TEXT NOT NULL DEFAULT 'rascunho'
                 CHECK (status IN ('rascunho','aprovada','enviada','arquivada')),
  archived_at    TIMESTAMPTZ,
  archive_note   TEXT,
  created_by     UUID REFERENCES app_users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS minutes_date_idx ON minutes(session_date DESC);
CREATE INDEX IF NOT EXISTS minutes_status_idx ON minutes(status);

-- ---------- Movimento de caixa (Tesouraria: entradas e saídas) ----------
CREATE TABLE IF NOT EXISTS cash_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT NOT NULL CHECK (kind IN ('entrada','saida')),
  category        TEXT NOT NULL CHECK (category IN
                  ('obras','agua','luz','gob','gobgo','retirada','doacao','beneficencia',
                   'internet','aluguel','tronco','outro')),
  description     TEXT NOT NULL,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  movement_date   DATE NOT NULL,
  reference_month TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES app_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cash_movements_date_idx ON cash_movements(movement_date DESC);
CREATE INDEX IF NOT EXISTS cash_movements_kind_idx ON cash_movements(kind);

-- ---------- Auditoria (quem fez o quê) ----------
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES app_users(id) ON DELETE SET NULL,
  user_name   TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address  INET
);
-- Guarda o nome de quem agiu na própria linha: assim o histórico continua
-- legível mesmo se a conta do usuário for apagada depois.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_name TEXT;
CREATE INDEX IF NOT EXISTS audit_log_date_idx ON audit_log(occurred_at DESC);

-- ---------- Gatilhos de updated_at ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lodge_set_updated ON lodge;
CREATE TRIGGER lodge_set_updated BEFORE UPDATE ON lodge
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS brothers_set_updated ON brothers;
CREATE TRIGGER brothers_set_updated BEFORE UPDATE ON brothers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS communications_set_updated ON communications;
CREATE TRIGGER communications_set_updated BEFORE UPDATE ON communications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS minutes_set_updated ON minutes;
CREATE TRIGGER minutes_set_updated BEFORE UPDATE ON minutes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- Dados iniciais da Loja ----------
INSERT INTO lodge (official_name, power_name)
SELECT 'Administração Loja X', ''
WHERE NOT EXISTS (SELECT 1 FROM lodge);

-- ---------- Notificações internas (avisos entre ofícios) ----------
-- Ex.: a Fraternidade Feminina agenda um evento e a Secretaria recebe
-- o aviso. O aviso é destinado a um perfil (target_role); qualquer
-- usuário daquele perfil pode marcá-lo como ciente.
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_role TEXT NOT NULL,
  title       TEXT NOT NULL,
  message     TEXT,
  page        TEXT,
  ref_id      UUID,
  created_by  UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at     TIMESTAMPTZ,
  read_by     UUID REFERENCES app_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS notifications_destino_idx
  ON notifications (target_role, read_at, created_at DESC);

-- ---------- Migração: perfil "Irmão" e vínculo da conta ----------
-- Perfil "Irmão": enxerga o calendário da Loja e apenas o próprio
-- relatório individual. A conta pode ser vinculada ao cadastro do
-- irmão (app_users.brother_id) para permitir o relatório pessoal.
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('admin','veneravel','secretario','chanceler','tesoureiro','fraternidade','irmao'));
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS brother_id UUID REFERENCES brothers(id) ON DELETE SET NULL;

-- ---------- Migração v0.4.0: reestruturação da Tesouraria ----------
-- Taxa extra (aprovada em ata/loja, cobrada de todos ou de alguns irmãos)
-- e descrição da cobrança (ex.: "Taxa extra — reforma do Templo").
ALTER TABLE contributions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE contributions DROP CONSTRAINT IF EXISTS contributions_contribution_type_check;
ALTER TABLE contributions ADD CONSTRAINT contributions_contribution_type_check
  CHECK (contribution_type IN ('mensalidade','taxa_extra','tronco','doacao','outro'));
-- Só a mensalidade é única por irmão/mês; taxas extras, doações e tronco
-- podem se repetir no mesmo mês.
-- (O índice único da mensalidade é criado na migração v0.5.0, que leva em
-- conta o pagamento parcial.)
DROP INDEX IF EXISTS contributions_unique_monthly;
-- Retirada do saldo da Loja: referência da ata que aprovou a saída.
ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS approval_ref TEXT;
-- Retirada específica do Tronco de Beneficência (aprovada em ata).
ALTER TABLE cash_movements DROP CONSTRAINT IF EXISTS cash_movements_category_check;
ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_category_check
  CHECK (category IN ('obras','agua','luz','gob','gobgo','retirada','retirada_tronco','doacao','beneficencia',
                      'internet','aluguel','tronco','outro'));

-- ---------- Migração v0.5.0: pagamento parcial, correções e envios ao GOB ----------
-- Pagamento parcial (acordo): a parte paga fica na cobrança original e o
-- restante vira uma nova cobrança pendente ligada a ela (parent_id). Só a
-- cobrança original conta para "uma mensalidade por irmão/mês".
ALTER TABLE contributions ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES contributions(id) ON DELETE SET NULL;
DROP INDEX IF EXISTS contributions_unique_mensalidade;
CREATE UNIQUE INDEX IF NOT EXISTS contributions_unique_mensalidade_v2
  ON contributions(brother_id, reference_month)
  WHERE brother_id IS NOT NULL AND contribution_type = 'mensalidade' AND parent_id IS NULL;

-- Correções financeiras: o tesoureiro pede e o Venerável aprova.
-- Guarda o que muda, o motivo e quem decidiu.
CREATE TABLE IF NOT EXISTS financial_corrections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('contribution','cash_movement')),
  entity_id     UUID NOT NULL,
  action        TEXT NOT NULL CHECK (action IN ('update','delete')),
  changes       JSONB,
  before_data   JSONB,
  reason        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','recusada')),
  requested_by  UUID REFERENCES app_users(id) ON DELETE SET NULL,
  requested_by_name TEXT,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by    UUID REFERENCES app_users(id) ON DELETE SET NULL,
  decided_by_name TEXT,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT
);
CREATE INDEX IF NOT EXISTS financial_corrections_status_idx ON financial_corrections(status, requested_at DESC);

-- Controle de envios ao GOB / GOB-GO (Secretaria).
CREATE TABLE IF NOT EXISTS gob_submissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type    TEXT NOT NULL CHECK (doc_type IN
              ('ata','iniciacao','filiacao','desligamento','transferencia','votacao_diretoria','kit_placet','outro')),
  title       TEXT NOT NULL,
  power       TEXT NOT NULL DEFAULT 'GOB' CHECK (power IN ('GOB','GOB-GO')),
  status      TEXT NOT NULL DEFAULT 'a_enviar' CHECK (status IN ('a_enviar','enviado','concluido','devolvido')),
  due_date    DATE,
  sent_on     DATE,
  protocol    TEXT,
  notes       TEXT,
  created_by  UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gob_submissions_status_idx ON gob_submissions(status, due_date);
