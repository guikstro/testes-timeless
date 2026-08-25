/** Shape of jobs on the `meta-sync` queue — shared by the API (producer) and worker (consumer). */
export interface MetaSyncJob {
  organizationId: string;
}
