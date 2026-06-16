# Checklist: Portal do Paciente + Interfaces por Papel

## Objetivo
Consolidar fluxo de convite do portal do paciente no cadastro e adaptar navegação por papel com
acesso baseado em permissões.

## Checklist de implementação

- [x] Confirmar que `createPatient` não cria usuário Supabase nem vínculo de portal no fluxo atual.
  - Ref.: `src/services/patientsApi.ts:1261`
- [x] Confirmar ação de convite existente em `PatientListContent` e `portal-invite`.
  - Ref.: `src/app/patient-list/components/PatientListContent.tsx`, `src/app/api/clinic/patients/[patientId]/portal-invite/route.ts`
- [x] Incluir convite no fluxo de criação de paciente via checkbox em `PatientFormModal`.
  - Ref.: `src/app/patient-list/components/PatientListContent.tsx`
- [x] Encadear convite após criação no `handleSubmitPatientForm` sem bloquear criação.
  - Ref.: `src/app/patient-list/components/PatientListContent.tsx`
- [x] Exibir fluxo de retry (`Tentar convidar novamente`) quando convite falha.
  - Ref.: `src/app/patient-list/components/PatientListContent.tsx`
- [x] Trocar ação de portal de apenas ícone para texto “Convidar portal do paciente”.
  - Ref.: `src/app/patient-list/components/PatientListContent.tsx`
- [x] Exibir validação de pré-requisito (e-mail e consentimento) no modal de cadastro.
  - Ref.: `src/app/patient-list/components/PatientListContent.tsx`
- [x] Melhorar mensagem de erro no fluxo de convite com causas prováveis.
  - Ref.: `src/app/patient-list/components/PatientListContent.tsx` (`describePortalAccessError`)  
  - Ref.: `src/app/patient-list/components/PatientListContent.tsx` (`handlePortalAction`)
- [x] Refatorar `getCurrentAppSession` para `activeTenantRoles` (união) e permissões por roles.
  - Ref.: `src/services/session/getCurrentAppSession.ts`
- [x] Introduzir `activeTenantRoles` + preservar `activeTenantRole` para compatibilidade.
  - Ref.: `src/services/session/getCurrentAppSession.ts`, `src/lib/auth/getCurrentUserContext.ts`
- [x] Atualizar `canAccessClinicWorkspace`, `canViewMedicalPrescriptions`,
  `canManageTenantUsers`, `canAccessPatientPortal` para usar permissão + regras combinadas.
  - Ref.: `src/services/session/getCurrentAppSession.ts`
- [x] Atualizar `getCurrentUserContext` para propagar permissões recalculadas.
  - Ref.: `src/lib/auth/getCurrentUserContext.ts`
- [x] Revisar `TabProntuario` para usar `timeline.sensitive.read` e não hardcoded por role.
  - Ref.: `src/app/paciente-360/components/tabs/TabProntuario.tsx`
- [x] Revisar `TabPrescricoes` para remover bloqueio por `currentRole`.
  - Ref.: `src/app/paciente-360/components/tabs/TabPrescricoes.tsx`
- [x] Ajustar `Patient360Tabs` com matriz de visibilidade por papel (`physician`, `nutritionist`,
  `fitness_professional`) e fallback por permissão.
  - Ref.: `src/app/paciente-360/components/Patient360Tabs.tsx`

## Pendências para fechar o ciclo

- [ ] Testes unitários de:
  - criação sem convite sem chamada ao Auth;
  - criação com convite e sucesso;
  - criação com convite e e-mail inválido com mensagem explícita.
- [ ] Smoke test autenticado em `/clinic/patients` para validar botão textual e retorno de sucesso/erro estruturado.
- [ ] Smoke por perfil para validar abas permitidas a:
  - admin + clínico,
  - nutrição,
  - fitness.
