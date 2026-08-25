/** Shape of jobs on the `meta-conversions` queue — shared by the API (producer) and worker (consumer). */
export interface MetaConversionSendJob {
  conversionEventId: string;
}
