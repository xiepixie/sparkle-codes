import { getAppUrl } from "@repo/utils";
import { TiltWrapper } from "@repo/ui";
import { GithubActivity } from "@/components/SiteWidgets";
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  CalendarClock,
  Mail,
  NotebookPen,
  Sparkles,
  TestTube2,
  Workflow,
} from "lucide-react";
import Link from "next/link";

const focusAreas = [
  {
    title: "Applied AI products",
    description:
      "I turn LLM workflows into products that remove repetitive coordination and create visible daily leverage.",
    icon: Bot,
  },
  {
    title: "Testing automation",
    description:
      "Playwright, Python-generated test cases, bug management, and quality workflows are part of my practical toolkit.",
    icon: TestTube2,
  },
  {
    title: "Systematic personal ops",
    description:
      "I like tooling that helps people plan better, learn faster, and keep momentum without chaos.",
    icon: Workflow,
  },
  {
    title: "Technical writing",
    description:
      "sparkle.codes is where product thinking, implementation notes, and experiments become reusable knowledge.",
    icon: BrainCircuit,
  },
];

const projects = [
  {
    title: "Time Vista Tasks",
    href: "https://time-vista-tasks.vercel.app/",
    eyebrow: "AI scheduling system",
    description:
      "A personal time-management app that uses agents and Notion MCP to update schedules, rearrange tasks, and help users execute the day with less friction.",
    bullets: [
      "Agent-assisted planning",
      "Notion MCP workflows",
      "Built for real execution",
    ],
    icon: CalendarClock,
  },
  {
    title: "Smart Error Archiver",
    href: "https://smart-error-archiver.vercel.app/",
    eyebrow: "AI mistake management",
    description:
      "An AI-first error notebook for study and review: upload images, recognize formulas, record questions, and revisit with spaced repetition.",
    bullets: [
      "AI vision ingestion",
      "LaTeX-friendly authoring",
      "Spaced repetition review",
    ],
    icon: NotebookPen,
  },
];

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.8rem] font-semibold uppercase tracking-[0.25em] text-primary/80">
      {children}
    </p>
  );
}

import { warm } from "@/lib/blog";

export default async function HomePage() {
  // Pre-warm the global blog post cache in the background.
  // This ensures sub-millisecond filtering when the user navigates to /blog
  warm().catch((err) => console.error("Cache warm failed:", err));

  return (
    <div className="relative overflow-hidden selection:bg-primary/20">
      {/* Hero Section */}
      <section className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-12 pt-24 sm:px-6 sm:pb-16 sm:pt-28 lg:pb-24 lg:pt-36">
        <div className="grid gap-12 lg:grid-cols-12 items-center">
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col items-start">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.24em] text-primary/90">
              <Sparkles className="h-3.5 w-3.5" />
              sparkle.codes
              <span className="text-primary/45">/</span>
              xpx personal lab
            </div>

            <h1 className="mt-8 max-w-[14ch] text-balance text-[clamp(3.5rem,7vw,6.5rem)] font-bold leading-[1.05] tracking-[-0.04em] text-foreground">
              Crafting AI tools & quiet automation.
            </h1>
            <p className="mt-8 max-w-[54ch] text-[1.15rem] leading-[1.8] text-muted-foreground/90">
              Hi, I'm <span className="font-semibold text-foreground">Xavier Pax (xpx)</span>. 
              I build full-stack interfaces, rigorous testing systems, and practical AI applications 
              that replace daily chaos with calm momentum.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href="/blog"
                className="group inline-flex min-h-12 items-center justify-center rounded-2xl bg-primary px-8 text-base font-medium text-primary-foreground shadow-glow transition-all hover:scale-[1.02] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Read the blog
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a
                href="mailto:wrxpx5@163.com"
                className="group inline-flex min-h-12 items-center justify-center rounded-2xl border border-border/80 bg-background/50 px-8 text-base font-medium backdrop-blur-md transition-colors hover:border-primary/40 hover:bg-accent active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Mail className="mr-2 h-4 w-4" />
                Get in touch
              </a>
            </div>
          </div>

          <div className="lg:col-span-5 xl:col-span-4 mt-8 lg:mt-0">
            <TiltWrapper className="rounded-[2rem]" variant="nebula" tiltAngle={5}>
              <div className="rounded-[1.9rem] border border-primary/15 bg-background/40 p-7 backdrop-blur-xl">
                <SectionEyebrow>Status</SectionEyebrow>
                <h2 className="mt-3 text-[1.5rem] font-semibold leading-[1.2] tracking-[-0.03em]">
                  Building rhythm
                </h2>
                <p className="mt-2 text-[0.95rem] text-muted-foreground">
                  Ideas in motion, tracked via GitHub.
                </p>
                <div className="mt-6">
                  <GithubActivity />
                </div>
              </div>
            </TiltWrapper>
          </div>
        </div>
      </section>

      {/* Focus Areas */}
      <section className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-20 sm:px-6 sm:pb-32">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {focusAreas.map(({ title, description, icon: Icon }) => (
            <div
              key={title}
              className="group rounded-[2rem] border border-border/40 bg-background/30 p-8 backdrop-blur-md transition-colors hover:border-primary/20 hover:bg-background/50"
            >
              <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/15 bg-primary/5 text-primary transition-transform group-hover:scale-110">
                <Icon className="h-6 w-6" />
              </div>
              <h2 className="text-[1.2rem] font-semibold leading-7 tracking-[-0.02em] text-foreground/90">
                {title}
              </h2>
              <p className="mt-4 text-[0.98rem] leading-[1.7] text-muted-foreground">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Selected Work */}
      <section className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-24 sm:px-6 sm:pb-36">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <div className="sticky top-32">
              <SectionEyebrow>Selected work</SectionEyebrow>
              <h2 className="mt-4 text-[clamp(2.5rem,4vw,3.5rem)] font-bold leading-[1.05] tracking-[-0.04em]">
                Crafted for friction.
              </h2>
              <p className="mt-6 text-[1.1rem] leading-[1.7] text-muted-foreground">
                I build products to solve real workflows. Here are the active systems currently running 
                my daily routines.
              </p>
            </div>
          </div>

          <div className="grid gap-8 lg:col-span-8">
            {projects.map(({ title, href, eyebrow, description, bullets, icon: Icon }) => (
              <TiltWrapper key={title} className="rounded-[2.5rem]" variant="nebula" tiltAngle={4}>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="group block rounded-[2.4rem] border border-border/50 bg-background/40 p-8 backdrop-blur-xl transition-all hover:border-primary/30 hover:bg-background/60 sm:p-10"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
                    <div>
                      <SectionEyebrow>{eyebrow}</SectionEyebrow>
                      <h3 className="mt-3 text-[2.2rem] font-bold leading-[1.1] tracking-[-0.03em] group-hover:text-primary transition-colors">
                        {title}
                      </h3>
                      <p className="mt-5 max-w-[45ch] text-[1.1rem] leading-[1.7] text-muted-foreground [overflow-wrap:anywhere]">
                        {description}
                      </p>
                    </div>
                    <div className="hidden shrink-0 sm:flex h-16 w-16 items-center justify-center rounded-3xl border border-primary/20 bg-primary/10 text-primary transition-transform group-hover:rotate-6">
                      <Icon className="h-7 w-7" />
                    </div>
                  </div>

                  <div className="mt-8 flex flex-wrap gap-3">
                    {bullets.map((bullet) => (
                      <div
                        key={bullet}
                        className="rounded-full border border-border/80 bg-background/80 px-4 py-2 text-[0.9rem] font-medium text-foreground/80"
                      >
                        {bullet}
                      </div>
                    ))}
                  </div>
                </a>
              </TiltWrapper>
            ))}
          </div>
        </div>
      </section>

      {/* Writing & Docs CTA */}
      <section className="relative z-10 mx-auto w-full max-w-5xl px-5 pb-24 sm:px-6">
        <div className="flex flex-col items-center text-center rounded-[3rem] border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent p-12 sm:p-20 backdrop-blur-xl">
          <div className="inline-flex items-center justify-center rounded-full bg-primary/10 p-4 mb-6">
            <NotebookPen className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-[clamp(2.2rem,4vw,3.5rem)] font-bold leading-[1.1] tracking-[-0.03em]">
            Want to see how it's built?
          </h2>
          <p className="mt-6 max-w-[44ch] text-[1.15rem] leading-[1.7] text-muted-foreground">
            I document my implementations, testing strategies, and architecture decisions openly in my notes.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <Link
              href="/blog"
              className="inline-flex h-14 items-center justify-center rounded-2xl bg-primary px-10 text-[1.05rem] font-medium text-primary-foreground shadow-glow transition-transform hover:scale-[1.02] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Explore the blog
            </Link>
            <Link
              href={getAppUrl('docs')}
              className="inline-flex h-14 items-center justify-center rounded-2xl border border-border/80 bg-background/50 px-10 text-[1.05rem] font-medium transition-colors hover:bg-accent active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Read the Docs
            </Link>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-border/40 bg-background/30 px-5 py-12 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-[1.1rem] font-bold tracking-[-0.02em]">sparkle.codes</p>
            </div>
            <p className="mt-3 text-[0.95rem] text-muted-foreground">
              Built with precision. Designed with starlight.
            </p>
          </div>

          <div className="flex items-center gap-8 text-[0.95rem] font-medium text-muted-foreground">
            <Link href="/blog" className="transition-colors hover:text-primary">
              Blog
            </Link>
            <Link href={getAppUrl('docs')} className="transition-colors hover:text-primary">
              Docs
            </Link>
            <a href="mailto:wrxpx5@163.com" className="transition-colors hover:text-primary">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
