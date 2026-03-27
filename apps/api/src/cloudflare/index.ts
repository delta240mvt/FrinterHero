import { readApiEnv, type ApiEnv } from './env.ts';
import { handleJobQueueBatch } from './queues/index.ts';
import { routeRequest } from './router.ts';
import { GeoRunWorkflow, startGeoRunWorkflow, type GeoRunWorkflowBinding } from './workflows/geo-run.ts';
import { RedditRunWorkflow, startRedditRunWorkflow, type RedditRunWorkflowBinding } from './workflows/reddit-run.ts';
import { YoutubeRunWorkflow, startYoutubeRunWorkflow, type YoutubeRunWorkflowBinding } from './workflows/youtube-run.ts';
import { BcScrapeWorkflow, startBcScrapeWorkflow, type BcScrapeWorkflowBinding } from './workflows/bc-scrape.ts';
import { BcParseWorkflow, startBcParseWorkflow, type BcParseWorkflowBinding } from './workflows/bc-parse.ts';
import { BcSelectorWorkflow, startBcSelectorWorkflow, type BcSelectorWorkflowBinding } from './workflows/bc-selector.ts';
import { BcClusterWorkflow, startBcClusterWorkflow, type BcClusterWorkflowBinding } from './workflows/bc-cluster.ts';
import { BcGenerateWorkflow, startBcGenerateWorkflow, type BcGenerateWorkflowBinding } from './workflows/bc-generate.ts';
import { ShCopyWorkflow, startShCopyWorkflow, type ShCopyWorkflowBinding } from './workflows/sh-copy.ts';
import { ShVideoWorkflow, startShVideoWorkflow, type ShVideoWorkflowBinding } from './workflows/sh-video.ts';
import { ShPublishWorkflow, startShPublishWorkflow, type ShPublishWorkflowBinding } from './workflows/sh-publish.ts';

const WORKER_QUEUE_TOPICS = ['geo', 'reddit', 'youtube', 'bc-scrape', 'bc-parse', 'bc-selector', 'bc-cluster', 'bc-generate', 'sh-copy', 'sh-video', 'sh-publish'] as const;

interface WorkerEnv extends Partial<ApiEnv> {
  GEO_RUN_WORKFLOW?: GeoRunWorkflowBinding;
  REDDIT_RUN_WORKFLOW?: RedditRunWorkflowBinding;
  YOUTUBE_RUN_WORKFLOW?: YoutubeRunWorkflowBinding;
  BC_SCRAPE_WORKFLOW?: BcScrapeWorkflowBinding;
  BC_PARSE_WORKFLOW?: BcParseWorkflowBinding;
  BC_SELECTOR_WORKFLOW?: BcSelectorWorkflowBinding;
  BC_CLUSTER_WORKFLOW?: BcClusterWorkflowBinding;
  BC_GENERATE_WORKFLOW?: BcGenerateWorkflowBinding;
  SH_COPY_WORKFLOW?: ShCopyWorkflowBinding;
  SH_VIDEO_WORKFLOW?: ShVideoWorkflowBinding;
  SH_PUBLISH_WORKFLOW?: ShPublishWorkflowBinding;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

const worker = {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const start = Date.now();
    const { method } = request;
    const pathname = new URL(request.url).pathname;
    try {
      let response: Response;

      if (method === 'GET' && pathname === '/health') {
        response = await routeRequest(request);
      } else {
        response = await routeRequest(request, readApiEnv(env));
      }

      console.log(JSON.stringify({
        type: 'request',
        method,
        pathname,
        status: response.status,
        duration_ms: Date.now() - start,
      }));

      return response;
    } catch (error) {
      console.error(JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }));
      return json(500, {
        error: 'Internal server error',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  },

  async queue(batch: unknown, env: WorkerEnv): Promise<void> {
    const start = Date.now();
    const messageCount = (batch as { messages?: unknown[] }).messages?.length ?? 0;
    try {
      if (
        !env.GEO_RUN_WORKFLOW ||
        !env.REDDIT_RUN_WORKFLOW ||
        !env.YOUTUBE_RUN_WORKFLOW ||
        !env.BC_SCRAPE_WORKFLOW ||
        !env.BC_PARSE_WORKFLOW ||
        !env.BC_SELECTOR_WORKFLOW ||
        !env.BC_CLUSTER_WORKFLOW ||
        !env.BC_GENERATE_WORKFLOW ||
        !env.SH_COPY_WORKFLOW ||
        !env.SH_VIDEO_WORKFLOW ||
        !env.SH_PUBLISH_WORKFLOW
      ) {
        throw new Error('Missing Cloudflare workflow bindings');
      }

      const geoWorkflow = env.GEO_RUN_WORKFLOW;
      const redditWorkflow = env.REDDIT_RUN_WORKFLOW;
      const youtubeWorkflow = env.YOUTUBE_RUN_WORKFLOW;
      const bcScrapeWorkflow = env.BC_SCRAPE_WORKFLOW;
      const bcParseWorkflow = env.BC_PARSE_WORKFLOW;
      const bcSelectorWorkflow = env.BC_SELECTOR_WORKFLOW;
      const bcClusterWorkflow = env.BC_CLUSTER_WORKFLOW;
      const bcGenerateWorkflow = env.BC_GENERATE_WORKFLOW;
      const shCopyWorkflow = env.SH_COPY_WORKFLOW;
      const shVideoWorkflow = env.SH_VIDEO_WORKFLOW;
      const shPublishWorkflow = env.SH_PUBLISH_WORKFLOW;

      await handleJobQueueBatch(
        batch as Parameters<typeof handleJobQueueBatch>[0],
        {
          startGeoWorkflow(message) {
            return startGeoRunWorkflow(geoWorkflow, message as Parameters<typeof startGeoRunWorkflow>[1]);
          },
          startRedditWorkflow(message) {
            return startRedditRunWorkflow(redditWorkflow, message as Parameters<typeof startRedditRunWorkflow>[1]);
          },
          startYoutubeWorkflow(message) {
            return startYoutubeRunWorkflow(youtubeWorkflow, message as Parameters<typeof startYoutubeRunWorkflow>[1]);
          },
          startBcScrapeWorkflow(message) {
            return startBcScrapeWorkflow(bcScrapeWorkflow, message as Parameters<typeof startBcScrapeWorkflow>[1]);
          },
          startBcParseWorkflow(message) {
            return startBcParseWorkflow(bcParseWorkflow, message as Parameters<typeof startBcParseWorkflow>[1]);
          },
          startBcSelectorWorkflow(message) {
            return startBcSelectorWorkflow(bcSelectorWorkflow, message as Parameters<typeof startBcSelectorWorkflow>[1]);
          },
          startBcClusterWorkflow(message) {
            return startBcClusterWorkflow(bcClusterWorkflow, message as Parameters<typeof startBcClusterWorkflow>[1]);
          },
          startBcGenerateWorkflow(message) {
            return startBcGenerateWorkflow(bcGenerateWorkflow, message as Parameters<typeof startBcGenerateWorkflow>[1]);
          },
          startShCopyWorkflow(message) {
            return startShCopyWorkflow(shCopyWorkflow, message as Parameters<typeof startShCopyWorkflow>[1]);
          },
          startShVideoWorkflow(message) {
            return startShVideoWorkflow(shVideoWorkflow, message as Parameters<typeof startShVideoWorkflow>[1]);
          },
          startShPublishWorkflow(message) {
            return startShPublishWorkflow(shPublishWorkflow, message as Parameters<typeof startShPublishWorkflow>[1]);
          },
        },
        {
          async onUnsupportedTopic(_message, entry) {
            entry.ack();
          },
          supportedTopics: WORKER_QUEUE_TOPICS,
        },
      );

      console.log(JSON.stringify({
        type: 'queue_batch',
        messageCount,
        duration_ms: Date.now() - start,
      }));
    } catch (error) {
      console.error(JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }));
      throw error;
    }
  },
};

export default worker;
export { GeoRunWorkflow, RedditRunWorkflow, YoutubeRunWorkflow, BcScrapeWorkflow, BcParseWorkflow, BcSelectorWorkflow, BcClusterWorkflow, BcGenerateWorkflow, ShCopyWorkflow, ShVideoWorkflow, ShPublishWorkflow };
