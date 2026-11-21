// Destructive account operations must use confirmed results, never turn a
// failed/null query into "no remaining accounts or memberships".
export function confirmedQuery<T>(data: T | null, error: unknown): T {
  if (error) throw error;
  if (data === null) throw new Error("Não foi possível confirmar os vínculos da conta. Tente novamente.");
  return data;
}