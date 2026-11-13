import type { FeedItem } from './feeds'
import { scoreItem } from './scoring'

const HOUR = 3_600_000

interface SampleDef {
  feedTitle: string
  title: string
  link: string
  hoursAgo: number
  description: string
}

const SAMPLES: SampleDef[] = [
  {
    feedTitle: 'AWS News Blog',
    title: 'Kiro agents now orchestrate multi-step AWS builds from a single spec',
    link: 'https://aws.amazon.com/blogs/aws/',
    hoursAgo: 3,
    description:
      'Kiro now turns a written spec into a working AWS deployment: specs drive requirements, design and tasks, and agents execute them against your account. This post walks through a full agent-led build of a serverless API, including the spec files, the hooks that guard each step, and where the human still reviews. For builders shipping with AI agents, the workflow matters more than the model.',
  },
  {
    feedTitle: 'AWS Machine Learning Blog',
    title: 'Building agentic coding workflows with small models and strict evals',
    link: 'https://aws.amazon.com/blogs/machine-learning/',
    hoursAgo: 7,
    description:
      'Small models win when the workflow is strict: deterministic tools, tight evals, and a spec the agent cannot drift from. This post compares agent harnesses on real coding tasks, shows where large models waste budget, and gives a checklist for production agentic systems. Includes failure modes and how to measure them.',
  },
  {
    feedTitle: 'Hacker News',
    title: 'Show HN: Resurrected Reader — Google Reader reborn as a reading radar',
    link: 'https://news.ycombinator.com/',
    hoursAgo: 11,
    description:
      'Google Reader died in 2013. This project brings it back as a radar: every item scored for signal, high-signal reads turned into Kiro tasks. Built for Kiroween 2026. The discussion covers whether RSS can still win, what a modern reader should do that the old one never did, and why reading without action is just hoarding.',
  },
  {
    feedTitle: 'AWS News Blog',
    title: 'Security baseline for AI-built apps: what to check before you ship',
    link: 'https://aws.amazon.com/blogs/aws/',
    hoursAgo: 26,
    description:
      'AI agents write code fast, including insecure code fast. This checklist covers secrets handling, dependency review, input validation, and the IAM least-privilege baseline every AI-built app should pass before production. Short, concrete, and built for teams shipping with agents in the loop.',
  },
  {
    feedTitle: 'AWS Machine Learning Blog',
    title: 'From demo to production: the missing middle of AI startup products',
    link: 'https://aws.amazon.com/blogs/machine-learning/',
    hoursAgo: 50,
    description:
      'Most AI demos die in the gap between a good prompt and a product someone pays for. This post maps that gap: evals, cost control, onboarding, and the distribution work nobody demos. Written for founders building AI products on AWS, with numbers from real launches.',
  },
  {
    feedTitle: 'Hacker News',
    title: 'Ask HN: How do you triage 200+ RSS items a day without burning out?',
    link: 'https://news.ycombinator.com/',
    hoursAgo: 74,
    description:
      'Two hundred items a day, most of it noise. How do experienced builders triage? The thread collects real systems: scoring rules, time-boxed reading sessions, read-it-later discipline, and when to unsubscribe entirely. Useful context for anyone building a reader that respects attention.',
  },
]

const FEED_ID_BY_TITLE: Record<string, string> = {
  'AWS News Blog': 'aws-news',
  'AWS Machine Learning Blog': 'aws-ml',
  'Hacker News': 'hn',
}

/** Offline fallback items, clearly labeled as sample in the UI. */
export function getSampleItems(): FeedItem[] {
  return SAMPLES.map((s, i) => {
    const pubDate = new Date(Date.now() - s.hoursAgo * HOUR).toISOString()
    return {
      id: `sample-${i}`,
      feedId: FEED_ID_BY_TITLE[s.feedTitle] ?? 'unknown',
      feedTitle: s.feedTitle,
      title: s.title,
      link: s.link,
      pubDate,
      description: s.description,
      score: scoreItem(s.title, s.description, pubDate),
      sample: true,
    }
  })
}
