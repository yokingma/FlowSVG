/** The portable build injects the bundled worker; the ESM build writes the same source into this module. */
declare const __FLOW_GIF_WORKER__: string;
export const GIF_WORKER_SOURCE = typeof __FLOW_GIF_WORKER__ === "string" ? __FLOW_GIF_WORKER__ : "";
