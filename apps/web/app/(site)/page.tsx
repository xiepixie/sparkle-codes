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
import { BlogWarmup } from "@/components/Blog/BlogWarmup";
import { Copyright } from "@/components/Layout/Copyright";
import { GithubActivity } from "@/components/SiteWidgets";
import { warm } from "@/lib/blog";
import { TiltWrapper } from "@repo/ui";
import { getAppUrl } from "@repo/utils";

const focusAreas = [
  {
    title: "AI Workflows",
    description:
      "I'm exploring how LLMs can simplify the daily grind. Not a pro, just building 'calm' tools to manage the noise.",
    icon: Bot,
  },
  {
    title: "Sanity Testing",
    description:
      "Learning to use AI to write better tests. As an amateur, I rely on automated certainty to move fast without breaking things.",
    icon: TestTube2,
  },
  {
    title: "Math & Logic",
    description:
      "A math major's lens on code. I prefer first principles and clean abstractions over complex 'industry standards'.",
    icon: Workflow,
  },
  {
    title: "The Personal Lab",
    description:
      "sparkle.codes is my open notebook. I document the 'why' behind experiments, failures, and accidental discoveries.",
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

function SectionEyebrow({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`flex items-center gap-2 mb-2 ${className}`}>
      <div className="h-1.5 w-1.5 rounded-full bg-primary/60 shadow-[0_0_8px_rgba(var(--primary-rgb),0.4)]" />
      <p className="text-[0.75rem] font-bold uppercase tracking-[0.28em] text-primary/80">
        {children}
      </p>
    </div>
  );
}



export default async function HomePage() {
  // Pre-warm the global blog post cache in the background.
  // This ensures sub-millisecond filtering when the user navigates to /blog.
  // We use the 'void' operator to explicitly signal that this is an un-awaited background task.
  void warm().catch((err) => console.error("Cache warm failed:", err));

  return (
    <div className="relative overflow-hidden selection:bg-primary/20">
      <BlogWarmup />
      {/* Hero Section */}

      <section className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-16 pt-24 sm:px-6 sm:pb-20 sm:pt-32 lg:pb-32 lg:pt-40">
        <div className="grid gap-16 lg:grid-cols-12 items-center">
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col items-start">
            <div className="group inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.24em] text-primary/90 backdrop-blur-sm transition-colors hover:bg-primary/10">
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
              sparkle.codes
              <span className="text-primary/45">/</span>
              xpx personal lab
            </div>

            <h1 className="mt-8 max-w-[42rem] text-balance text-[clamp(2.8rem,8vw,5.8rem)] font-bold leading-[1.02] tracking-[-0.04em] text-foreground">
              Crafting <span className="bg-gradient-to-br from-primary via-primary/90 to-primary/60 bg-clip-text text-transparent">quiet experiments</span> & simple automation.
            </h1>
            <p className="mt-10 max-w-[32rem] text-[1.1rem] sm:text-[1.2rem] leading-[1.7] text-muted-foreground/90">
              Hi, I'm <span className="font-semibold text-foreground">Xavier Pax (xpx)</span>. 
              I'm a math hobbyist and software experimenter. This is my lab for exploring 
              how AI can make workflows more <span className="text-foreground/80 italic">reliable and legible</span>.
            </p>

            <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href="/blog"
                className="group relative inline-flex min-h-14 items-center justify-center overflow-hidden rounded-2xl bg-primary px-10 text-[1.05rem] font-semibold text-primary-foreground shadow-glow transition-all hover:scale-[1.02] active:scale-95"
              >
                <span className="relative z-10 flex items-center">
                  Read the blog
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              </Link>
              <a
                href="mailto:wrxpx5@163.com"
                className="group inline-flex min-h-14 items-center justify-center rounded-2xl border border-border/60 bg-background/40 px-10 text-[1.05rem] font-medium backdrop-blur-xl transition-all hover:border-primary/40 hover:bg-accent active:scale-95"
              >
                <Mail className="mr-3 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                Get in touch
              </a>
            </div>
          </div>

          <div className="lg:col-span-5 xl:col-span-4 mt-12 lg:mt-0 relative">
            <div className="absolute -inset-4 bg-glow opacity-30 blur-3xl pointer-events-none" />
            <TiltWrapper className="rounded-[2.2rem] shadow-glow-sm" variant="nebula" tiltAngle={5}>
              <SectionEyebrow>Recent Activity</SectionEyebrow>
              <h2 className="mt-4 text-[1.6rem] font-bold leading-tight tracking-[-0.03em]">
                The Daily Grind
              </h2>
              <p className="mt-2 text-[0.95rem] text-muted-foreground/80 leading-relaxed">
                Keeping the momentum with small, steady improvements.
              </p>
              <div className="mt-8">
                <GithubActivity />
              </div>
            </TiltWrapper>
          </div>
        </div>
      </section>

      {/* Focus Areas */}
      <section className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-24 sm:px-6 sm:pb-36">
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {focusAreas.map(({ title, description, icon: Icon }) => (
            <div
              key={title}
              className="group relative flex flex-col rounded-[2.2rem] border border-border/40 bg-background/30 p-8 sm:p-10 backdrop-blur-xl transition-all hover:border-primary/30 hover:bg-background/50 hover:shadow-glow-sm"
            >
              <div className="mb-8 inline-flex h-16 w-16 items-center justify-center rounded-[1.25rem] bg-primary/5 text-primary transition-all group-hover:scale-110 group-hover:bg-primary/10">
                <Icon className="h-7 w-7" />
              </div>
              <h2 className="text-[1.3rem] font-bold tracking-[-0.02em] text-foreground/90">
                {title}
              </h2>
              <p className="mt-4 text-[1.02rem] leading-[1.7] text-muted-foreground/90">
                {description}
              </p>
              <div className="mt-auto pt-8">
                <div className="h-px w-8 bg-border group-hover:w-full group-hover:bg-primary/30 transition-all duration-500" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Selected Work */}
      <section className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-24 sm:px-6 sm:pb-40">
        <div className="grid gap-16 lg:grid-cols-12 lg:gap-20">
          <div className="lg:col-span-4">
            <div className="sticky top-32">
              <SectionEyebrow>Selected work</SectionEyebrow>
              <h2 className="mt-5 text-[clamp(2.5rem,5vw,4.2rem)] font-bold leading-[1] tracking-[-0.04em]">
                Tools for <br /><span className="text-primary italic">Momentum.</span>
              </h2>
              <p className="mt-8 text-[1.15rem] leading-[1.8] text-muted-foreground">
                I experiment with functional prototypes to solve daily friction. These are living systems 
                currently running my own routines and learning loops.
              </p>
              <div className="mt-10 hidden lg:block">
                <div className="h-[2px] w-24 bg-gradient-to-r from-primary/40 to-transparent" />
              </div>
            </div>
          </div>

          <div className="grid gap-10 lg:col-span-8">
            {projects.map(({ title, href, eyebrow, description, bullets, icon: Icon }) => (
              <TiltWrapper key={title} className="rounded-[2.8rem] group/card" variant="nebula" tiltAngle={3}>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="block transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-8">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <SectionEyebrow>{eyebrow}</SectionEyebrow>
                        <div className="h-px flex-1 bg-border/40" />
                      </div>
                      <h3 className="mt-4 text-[2.4rem] font-bold leading-tight tracking-[-0.03em] group-hover/card:text-primary transition-all duration-300">
                        {title}
                      </h3>
                      <p className="mt-6 max-w-[32rem] text-[1.1rem] leading-[1.7] text-muted-foreground/90 [overflow-wrap:anywhere]">
                        {description}
                      </p>
                    </div>
                    <div className="hidden shrink-0 sm:flex h-20 w-20 items-center justify-center rounded-[2rem] bg-primary/5 text-primary/80 transition-all duration-500 group-hover/card:scale-110 group-hover/card:rotate-12 group-hover/card:bg-primary/10 group-hover/card:text-primary">
                      <Icon className="h-9 w-9" />
                    </div>
                  </div>

                  <div className="mt-10 flex flex-wrap gap-3">
                    {bullets.map((bullet) => (
                      <div
                        key={bullet}
                        className="rounded-full bg-background/50 px-5 py-2 text-[0.92rem] font-semibold text-foreground/75 border border-border/40 backdrop-blur-md group-hover/card:border-primary/20 transition-colors"
                      >
                        {bullet}
                      </div>
                    ))}
                    <div className="ml-auto inline-flex items-center gap-2 text-primary/0 group-hover/card:text-primary/100 transition-all duration-500 translate-x-4 group-hover/card:translate-x-0">
                      <span className="text-[0.9rem] font-bold uppercase tracking-wider">Launch</span>
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </a>
              </TiltWrapper>
            ))}
          </div>
        </div>
      </section>

      {/* Writing & Docs CTA - The "Open Notebook" Dossier */}
      <section className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-32 sm:px-6">
        <div className="group relative overflow-hidden rounded-[3.5rem] bg-background/30 p-1  transition-all duration-700 hover:shadow-glow">
          {/* Animated Border Glow */}
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          
          <div className="relative overflow-hidden flex flex-col items-center text-center rounded-[3.4rem] bg-background/40 p-12 sm:p-24 backdrop-blur-3xl border border-white/5">
            {/* Background Layers */}
            <div className="absolute inset-0 grid-bg opacity-[0.15] mix-blend-overlay pointer-events-none" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-[2px] bg-gradient-to-r from-transparent via-primary/20 to-transparent blur-sm" />
            
            {/* Technical Corner Markers */}
            <div className="absolute top-8 left-8 hidden sm:block">
              <p className="text-[10px] font-mono tracking-[0.3em] text-primary/40 uppercase">Ref: X-88.02</p>
            </div>
            <div className="absolute top-8 right-8 hidden sm:block">
              <p className="text-[10px] font-mono tracking-[0.3em] text-primary/40 uppercase">Scale: 1:1.00</p>
            </div>
            <div className="absolute bottom-8 left-8 hidden sm:block">
              <p className="text-[10px] font-mono tracking-[0.3em] text-primary/40 uppercase cursor-default">Coord: 35.68N / 139.75E</p>
            </div>

            <div className="relative z-10 w-full max-w-4xl">
              <div className="inline-flex items-center justify-center rounded-2xl bg-primary/5 p-5 mb-10 border border-primary/10 group-hover:bg-primary/10 transition-colors duration-500">
                <NotebookPen className="h-10 w-10 text-primary animate-pulse" />
              </div>
              
              <h2 className="text-[clamp(2.4rem,6vw,4.5rem)] font-bold leading-[1] tracking-[-0.05em] text-balance">
                The <span className="text-primary italic">Open Notebook</span> philosophy.
              </h2>
              
              <p className="mt-8 mx-auto max-w-[34rem] text-[1.15rem] leading-[1.8] text-muted-foreground/80 font-medium italic">
                I document the "why" behind every line. No technical pride—just a record of experiments, 
                failures, and the quiet logic that holds it all together.
              </p>

              <div className="mt-14 flex flex-col sm:flex-row gap-6 w-full sm:w-auto justify-center items-center">
                <Link
                  href="/blog"
                  className="group relative inline-flex h-16 w-full sm:w-auto items-center justify-center overflow-hidden rounded-[1.25rem] bg-primary px-12 text-[1.05rem] font-bold text-primary-foreground shadow-glow transition-all hover:scale-[1.02] active:scale-95"
                >
                  <span className="relative z-10 flex items-center">
                    Explore the Blog
                    <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                </Link>
                
                <Link
                  href={getAppUrl('docs')}
                  className="inline-flex h-16 w-full sm:w-auto items-center justify-center rounded-[1.25rem] bg-background/40 px-12 text-[1.05rem] font-bold backdrop-blur-md border border-border/80 transition-all hover:border-primary/40 hover:bg-accent active:scale-95"
                >
                  Lab Documentation
                </Link>
              </div>
              
              {/* Measurement Scale Detail */}
              <div className="mt-16 flex items-center justify-center gap-4 opacity-20 hidden sm:flex">
                <div className="h-px w-24 bg-border" />
                <div className="flex gap-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="w-1 h-3 bg-border rounded-full" />
                  ))}
                </div>
                <div className="h-px w-24 bg-border" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-border/40 bg-background/40 px-5 py-16 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <p className="text-[1.3rem] font-bold tracking-[-0.03em]">sparkle.codes</p>
            </div>
            <p className="max-w-xs text-[1rem] leading-relaxed text-muted-foreground/80">
              Personal research lab & industrial blog. <br />
              <span className="text-foreground/40 font-medium">Built with precision. Designed with starlight.</span>
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-x-12 gap-y-6 text-[1.05rem] font-semibold">
            <Link href="/blog" className="text-muted-foreground transition-all hover:text-primary hover:translate-y-[-2px]">
              The Blog
            </Link>
            <Link href={getAppUrl('docs')} className="text-muted-foreground transition-all hover:text-primary hover:translate-y-[-2px]">
              Documentation
            </Link>
            <a href="mailto:wrxpx5@163.com" className="text-muted-foreground transition-all hover:text-primary hover:translate-y-[-2px]">
              Get in Touch
            </a>
            <Copyright />
          </div>
        </div>
      </footer>
    </div>
  );
}
