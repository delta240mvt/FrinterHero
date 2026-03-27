import { readApiEnv, type ApiEnv } from './env.ts';
import { handleJobQueueBatch } from './queues/index.ts';
import { routeRequest } from './router.ts';
import { GeoRunWorkflow, startGeoRunWorkflow, type GeoRunWorkflowBinding } from './workflows/geo-run.ts';
import { RedditRunWorkflow, startRedditRunWorkflow, type RedditRunWorkflowBinding } from './workflows/reddit-run.ts';
import { YoutubeRunWorkflow, startYoutubeRunWorkflow, type YoutubeRunWorkflowBinding } from './workflows/youtube-run.ts';

const WORKER_QUEUE_TOPICS = ['geo', 'reddit', 'youtube'] as const;

interface WorkerEnv extends Partial<ApiEnv> {
  GEO_RUN_WORKFLOW?: GeoRunWorkflowBinding;
  REDDIT_RUN_WORKFLOW?: RedditRunWorkflowBinding;
  YOUTUBE_RUN_WORKFLOW?: YoutubeRunWorkflowBinding;
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
    try {
      const pathname = new URL(request.url).pathname;

      if (request.method === 'GET' && pathname === '/health') {
        return await routeRequest(request);
      }

      return await routeRequest(request, readApiEnv(env));
    } catch (error) {
      return json(500, {
        error: 'Internal server error',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  },

  async queue(batch: unknown, env: WorkerEnv): Promise<void> {
    if (!env.GEO_RUN_WORKFLOW || !env.REDDIT_RUN_WORKFLOW || !env.YOUTUBE_RUN_WORKFLOW) {
      throw new Error('Missing Cloudflare workflow bindings');
    }

    const geoWorkflow = env.GEO_RUN_WORKFLOW;
    const redditWorkflow = env.REDDIT_RUN_WORKFLOW;
    const youtubeWorkflow = env.YOUTUBE_RUN_WORKFLOW;

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
        async startBcScrapeWorkflow() {
          throw new Error('Workflow starter not implemented for topic: bc-scrape');
        },
        async startBcParseWorkflow() {
          throw new Error('Workflow starter not implemented for topic: bc-parse');
        },
        async startBcSelectorWorkflow() {
          throw new Error('Workflow starter not implemented for topic: bc-selector');
        },
        async startBcClusterWorkflow() {
          throw new Error('Workflow starter not implemented for topic: bc-cluster');
        },
        async startBcGenerateWorkflow() {
          throw new Error('Workflow starter not implemented for topic: bc-generate');
        },
        async startShCopyWorkflow() {
          throw new Error('Workflow starter not implemented for topic: sh-copy');
        },
        async startShVideoWorkflow() {
          throw new Error('Workflow starter not implemented for topic: sh-video');
        },
        async startShPublishWorkflow() {
          throw new Error('Workflow starter not implemented for topic: sh-publish');
        },
      },
      {
        async onUnsupportedTopic(_message, entry) {
          entry.ack();
        },
        supportedTopics: WORKER_QUEUE_TOPICS,
      },
    );
  },
};

export default worker;
export { GeoRunWorkflow, RedditRunWorkflow, YoutubeRunWorkflow };
