export const OBSERVABILITY_SETTINGS = Symbol('OBSERVABILITY_SETTINGS');

export type ObservabilitySettings = {
  service: string;
  otlpEndpoint: string;
  sampleRatio: number;
};
