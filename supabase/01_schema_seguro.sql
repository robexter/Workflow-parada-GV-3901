-- GV-3901 parada — backend candidato V1.1 (sem dados reais).
-- Aplicar SOMENTE em Supabase aprovado pela organização, no SQL Editor.
-- Um workspace central com concorrência otimista. Adequado ao piloto controlado;
-- para maior escala: migrar para registros normalizados por entidade.
BEGIN;
CREATE SCHEMA IF NOT EXISTS gv3901_private;
REVOKE ALL ON SCHEMA gv3901_private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS public.gv3901_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 3 AND 120),
  role text NOT NULL CHECK (role IN ('admin','planner','operator','viewer')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gv3901_workspace (
  code text PRIMARY KEY DEFAULT 'GV3901' CHECK (code='GV3901'),
  state jsonb,
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  last_action text NOT NULL DEFAULT '',
  last_detail text NOT NULL DEFAULT ''
);
INSERT INTO public.gv3901_workspace (code) VALUES ('GV3901') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS gv3901_private.audit_revisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL,
  version bigint NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  detail text NOT NULL,
  before_state jsonb,
  after_state jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS gv3901_audit_code_idx ON gv3901_private.audit_revisions (code, version DESC);

ALTER TABLE public.gv3901_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gv3901_workspace ENABLE ROW LEVEL SECURITY;
-- Não liberar a tabela privada de auditoria pela API REST. 
ALTER TABLE gv3901_private.audit_revisions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.gv3901_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.gv3901_workspace FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.gv3901_members TO authenticated;
GRANT SELECT, UPDATE ON public.gv3901_workspace TO authenticated;
-- A função de trigger é protegida e não é acessível por usuários do app.

DROP POLICY IF EXISTS gv3901_member_self ON public.gv3901_members;
CREATE POLICY gv3901_member_self ON public.gv3901_members FOR SELECT TO authenticated
USING (user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS gv3901_workspace_read ON public.gv3901_workspace;
CREATE POLICY gv3901_workspace_read ON public.gv3901_workspace FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.gv3901_members m WHERE m.user_id=(SELECT auth.uid()) AND m.active
));
DROP POLICY IF EXISTS gv3901_workspace_write ON public.gv3901_workspace;
CREATE POLICY gv3901_workspace_write ON public.gv3901_workspace FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.gv3901_members m WHERE m.user_id=(SELECT auth.uid())
    AND m.active AND m.role IN ('admin','planner','operator')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.gv3901_members m WHERE m.user_id=(SELECT auth.uid())
    AND m.active AND m.role IN ('admin','planner','operator')
));

-- Audit after update: private SECDEF trigger (never exposed by PostgREST).
-- Membership validated by RLS and by commit; provenance tied to auth.uid() on server.
CREATE OR REPLACE FUNCTION gv3901_private.record_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Identidade obrigatória'; END IF;
 INSERT INTO gv3901_private.audit_revisions
   (code, version, user_id, action, detail, before_state, after_state)
 VALUES (NEW.code, NEW.version, auth.uid(), NEW.last_action, NEW.last_detail, OLD.state, NEW.state);
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION gv3901_private.record_audit() FROM PUBLIC;
DROP TRIGGER IF EXISTS gv3901_workspace_audit ON public.gv3901_workspace;
CREATE TRIGGER gv3901_workspace_audit AFTER UPDATE OF state ON public.gv3901_workspace
FOR EACH ROW EXECUTE FUNCTION gv3901_private.record_audit();

-- Validação de invariantes, inclusive contra UPDATE direto autenticado.
CREATE OR REPLACE FUNCTION gv3901_private.guard_workspace()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE existing_baselines int := 0; i int; user_role text; old_item jsonb; new_item jsonb; collection_name text;
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
 SELECT m.role INTO user_role FROM public.gv3901_members m
 WHERE m.user_id=auth.uid() AND m.active;
 IF user_role IS NULL OR user_role='viewer' THEN RAISE EXCEPTION 'Sem permissão de gravação'; END IF;
 IF NEW.code<>OLD.code OR NEW.version<>OLD.version+1 THEN
  RAISE EXCEPTION 'Versão inválida; recarregue o servidor';
 END IF;
 IF NEW.updated_by IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'A autoria deve corresponder ao login';
 END IF;
 IF NEW.state IS NULL OR jsonb_typeof(NEW.state)<>'object' OR NEW.state->>'schema'<>'1' THEN
  RAISE EXCEPTION 'Estado não corresponde ao formato V1';
 END IF;
 IF jsonb_typeof(NEW.state->'baselines') IS DISTINCT FROM 'array'
 OR jsonb_typeof(NEW.state->'events') IS DISTINCT FROM 'array'
 OR jsonb_typeof(NEW.state->'measurements') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Estrutura incompleta';
 END IF;
 IF pg_catalog.octet_length(NEW.state::text)>5242880 THEN
  RAISE EXCEPTION 'Limite do workspace excedido (5 MiB): solicite migração por entidade';
 END IF;
 IF OLD.state IS NOT NULL THEN
   existing_baselines := jsonb_array_length(COALESCE(OLD.state->'baselines','[]'::jsonb));
   IF jsonb_array_length(NEW.state->'baselines') < existing_baselines THEN
      RAISE EXCEPTION 'Linha de base congelada não pode ser removida';
   END IF;
   IF existing_baselines > 0 THEN
     FOR i IN 0..(existing_baselines-1) LOOP
       IF NEW.state->'baselines'->i IS DISTINCT FROM OLD.state->'baselines'->i THEN
         RAISE EXCEPTION 'Linha de base congelada não pode ser alterada';
       END IF;
     END LOOP;
   END IF;
   -- Proteção adicional: nenhum relato/medição/relatório existente desaparece.
   -- Retificações mantêm history adicional; relatórios salvos são imutáveis.
   FOREACH collection_name IN ARRAY ARRAY['events','measurements','reports'] LOOP
     FOR old_item IN SELECT value FROM pg_catalog.jsonb_array_elements(COALESCE(OLD.state->collection_name, '[]'::jsonb)) LOOP
       SELECT x.value INTO new_item
       FROM pg_catalog.jsonb_array_elements(COALESCE(NEW.state->collection_name, '[]'::jsonb)) AS x(value)
       WHERE x.value->>'id'=old_item->>'id' LIMIT 1;
       IF new_item IS NULL THEN RAISE EXCEPTION 'Não é permitido remover registro existente da coleção %', collection_name; END IF;
       IF collection_name='reports' AND new_item IS DISTINCT FROM old_item THEN
         RAISE EXCEPTION 'Versão de relatório já salva não pode ser alterada';
       END IF;
       IF collection_name IN ('events','measurements') AND new_item IS DISTINCT FROM old_item AND
         pg_catalog.jsonb_array_length(COALESCE(new_item->'history','[]'::jsonb)) <=
         pg_catalog.jsonb_array_length(COALESCE(old_item->'history','[]'::jsonb)) THEN
         RAISE EXCEPTION 'Retificação exige histórico de versão adicional na coleção %',collection_name;
       END IF;
     END LOOP;
   END LOOP;
   IF user_role='operator' AND (
      OLD.state->'project' IS DISTINCT FROM NEW.state->'project' OR
      OLD.state->'activities' IS DISTINCT FROM NEW.state->'activities' OR
      OLD.state->'baselines' IS DISTINCT FROM NEW.state->'baselines' OR
      OLD.state->'settings'->'workdays' IS DISTINCT FROM NEW.state->'settings'->'workdays'
   ) THEN
      RAISE EXCEPTION 'Planejamento só pode ser alterado por planejador/administrador';
   END IF;
 END IF;
 NEW.updated_at=now();
 NEW.last_action=left(COALESCE(NEW.last_action,''),200);
 NEW.last_detail=left(COALESCE(NEW.last_detail,''),800);
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION gv3901_private.guard_workspace() FROM PUBLIC;
DROP TRIGGER IF EXISTS gv3901_workspace_guard ON public.gv3901_workspace;
CREATE TRIGGER gv3901_workspace_guard BEFORE UPDATE OF state ON public.gv3901_workspace
FOR EACH ROW EXECUTE FUNCTION gv3901_private.guard_workspace();

-- RPC invocadora: read-check-write atômico com bloqueio da linha.
CREATE OR REPLACE FUNCTION public.gv3901_commit(
  p_expected_version bigint, p_state jsonb, p_action text DEFAULT '', p_detail text DEFAULT ''
) RETURNS TABLE(committed_version bigint, committed_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE present_version bigint;
BEGIN
 SELECT w.version INTO present_version FROM public.gv3901_workspace w
 WHERE w.code='GV3901' FOR UPDATE;
 IF present_version IS NULL THEN RAISE EXCEPTION 'Workspace não existe'; END IF;
 IF present_version<>p_expected_version THEN
   RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='GV3901_VERSION_CONFLICT';
 END IF;
 RETURN QUERY UPDATE public.gv3901_workspace w
   SET state=p_state, version=w.version+1, updated_by=auth.uid(),
       last_action=COALESCE(p_action,''), last_detail=COALESCE(p_detail,'')
   WHERE w.code='GV3901'
   RETURNING w.version,w.updated_at;
 IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado ou registro indisponível'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.gv3901_commit(bigint,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gv3901_commit(bigint,jsonb,text,text) TO authenticated;

-- Realtime: Postgres Changes; políticas RLS de leitura já aplicadas à tabela.
DO $$ BEGIN
 ALTER PUBLICATION supabase_realtime ADD TABLE public.gv3901_workspace;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
COMMIT;

-- NUNCA criar usuários automaticamente via SQL público.
-- Administrador deve criar convites por Auth (em ambiente aprovado) e, então,
-- cadastrar memberships via SQL Editor, usando UUID de auth.users:
-- INSERT INTO public.gv3901_members(user_id,display_name,role)
-- VALUES ('UUID_DA_CONTA'::uuid,'Robson Almeida','admin');
-- INSERT INTO public.gv3901_members(user_id,display_name,role)
-- VALUES ('UUID_DA_CONTA'::uuid,'Pedro Dantas','operator');
-- Operador especial: mesmo procedimento, role='operator', nome individual.
