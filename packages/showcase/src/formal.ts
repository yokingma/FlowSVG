/** User-selected formal content. Acceptance material never fills this catalog automatically. */
import type { CatalogSource } from "./model.js";
import { ragWorkflowExample } from "./examples/rag-workflow.js";
import { requestResponseExample } from "./examples/request-response.js";
import { projectArchitectureExample } from "./examples/project-architecture.js";
import { vllmMetalStackExample } from "./examples/vllm-metal-stack.js";
import { jobLifecycleExample } from "./examples/job-lifecycle.js";
import { orderEventPipelineExample } from "./examples/order-event-pipeline.js";
import { webServiceDeploymentExample } from "./examples/web-service-deployment.js";
import { cacheAsideSequenceExample } from "./examples/cache-aside-sequence.js";
import { llmInferenceExample } from "./examples/llm-inference.js";

export const catalogSource: CatalogSource = {
  definitions: [
    requestResponseExample,
    ragWorkflowExample,
    projectArchitectureExample,
    vllmMetalStackExample,
    jobLifecycleExample,
    orderEventPipelineExample,
    webServiceDeploymentExample,
    cacheAsideSequenceExample,
    llmInferenceExample
  ],
  order: [
    requestResponseExample.id,
    ragWorkflowExample.id,
    projectArchitectureExample.id,
    vllmMetalStackExample.id,
    jobLifecycleExample.id,
    orderEventPipelineExample.id,
    webServiceDeploymentExample.id,
    cacheAsideSequenceExample.id,
    llmInferenceExample.id
  ],
  defaultId: requestResponseExample.id
};
