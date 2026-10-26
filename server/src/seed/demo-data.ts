/**
 * Extra sample data for trying the app by hand (`npm run seed`). Loaded on top of the base seed in
 * seed/index.ts, which the automated tests use on its own. Chosen to exercise every feature and edge case:
 * a second instructor, a student who never posts, accented names and titles (search), a busy reading
 * with a long thread, a reading with no annotations, long and multi-paragraph posts, and edits.
 */
import type { ReadingDoc, UserDoc } from '../db/models'

export const DEMO_USERS: UserDoc[] = [
  { _id: 'u-marcus', name: 'Prof. Marcus Lee', role: 'instructor' },
  { _id: 'u-diego', name: 'Diego Ramírez', role: 'student' },
  { _id: 'u-emma', name: 'Emma Johansson', role: 'student' },
  { _id: 'u-farah', name: 'Farah Haddad', role: 'student' },
  { _id: 'u-gabriel', name: 'Gabriel Nguyen', role: 'student' },
  { _id: 'u-hannah', name: 'Hannah Kim', role: 'student' },
  { _id: 'u-ibrahim', name: 'Ibrahim Diallo', role: 'student' },
  // Never posts: shows up on the participation dashboard's "hasn't annotated" banner.
  { _id: 'u-quinn', name: 'Quinn Park', role: 'student' },
]

const assignedOn = (month: number, dayOfMonth: number) =>
  new Date(Date.UTC(2026, month - 1, dayOfMonth, 14))
const marcus = { createdBy: 'u-marcus', createdByName: 'Prof. Marcus Lee' }
const dana = { createdBy: 'u-dana', createdByName: 'Prof. Dana Reyes' }

export const DEMO_READINGS: ReadingDoc[] = [
  {
    _id: 'wollstonecraft-ch2',
    title: 'Wollstonecraft — A Vindication of the Rights of Woman, Chapter 2',
    description:
      'Read Chapter 2, “The Prevailing Opinion of a Sexual Character Discussed.” Track how Wollstonecraft ties virtue to reason and reason to education, and note where she answers Rousseau directly.',
    ...marcus,
    createdAt: assignedOn(9, 22),
  },
  {
    _id: 'durkheim-rules-ch1',
    title: 'Émile Durkheim — The Rules of Sociological Method, Chapter 1',
    description:
      '“What Is a Social Fact?” Come ready to explain the two tests Durkheim gives for a social fact, with an example of your own.',
    ...marcus,
    createdAt: assignedOn(9, 29),
  },
  {
    _id: 'du-bois-souls-ch1',
    title: 'Du Bois — The Souls of Black Folk, Chapter 1',
    description:
      '“Of Our Spiritual Strivings.” Focus on double consciousness and the image of the veil. Annotate at least one passage where the form of the chapter (the epigraphs, the music) supports the argument.',
    ...dana,
    createdAt: assignedOn(10, 6),
  },
  {
    _id: 'tocqueville-democratie',
    title: 'Tocqueville — De la démocratie en Amérique, Volume 2, Part 2',
    description:
      'Chapters 2 to 7, on individualism and associations. What does Tocqueville think democracy does to private life, and what does he think pulls people back out of it?',
    ...marcus,
    createdAt: assignedOn(10, 13),
  },
  {
    _id: 'arendt-eichmann-epilogue',
    title: 'Arendt — Eichmann in Jerusalem, Epilogue',
    description:
      'Read the Epilogue closely. Arendt makes three separate arguments about the trial: one about jurisdiction, one about the nature of the crime, and one about judgment itself. Before you annotate, try to state each in a single sentence. Then pick the one you find least convincing and explain why, with reference to a specific passage. We will spend the whole of next week’s seminar on this, so take your time.',
    ...dana,
    createdAt: assignedOn(10, 20),
  },
]

/** A post, timed in hours after its reading was assigned. `editedAt` too, when it was edited. */
export interface SeedPost {
  by: string
  at: number
  body: string
  editedAt?: number
}
export interface SeedThread extends SeedPost {
  replies?: SeedPost[]
}

/** Threads per reading. Readings from the base seed get a few more; the Arendt reading stays empty. */
export const DEMO_THREADS: Record<string, SeedThread[]> = {
  'civil-disobedience': [
    {
      by: 'u-diego',
      at: 20,
      body: 'The tax-refusal section is where the argument gets concrete. He spent one night in jail. Is that really comparable to the risks others took?',
      replies: [
        {
          by: 'u-hannah',
          at: 26,
          body: 'Fair, but he is explicit that the point is the principle, not the cost to him.',
        },
        {
          by: 'u-alice',
          at: 30,
          body: 'His night in jail is also what made the essay famous. The symbolism mattered.',
        },
      ],
    },
    {
      by: 'u-emma',
      at: 44,
      editedAt: 50,
      body: '“Under a government which imprisons any unjustly, the true place for a just man is also a prison.” A strong line, but it assumes everyone can afford to go to prison.',
    },
    {
      by: 'u-farah',
      at: 70,
      body: 'Compare King’s Letter from Birmingham Jail: King accepts the penalty openly to persuade others, while Thoreau mostly withdraws. Two different theories of what disobedience is for.',
      replies: [
        {
          by: 'u-gabriel',
          at: 72,
          body: 'Good comparison. King wants to move the majority; Thoreau seems fine being a minority of one.',
        },
        { by: 'u-farah', at: 75, body: 'Exactly, that’s his “majority of one” line.' },
      ],
    },
  ],
  'on-liberty-ch2': [
    {
      by: 'u-bob',
      at: 10,
      body: 'The three cases: the silenced opinion may be true; it may be partly true; and even if false, challenging it keeps the true opinion from becoming dead dogma.',
      replies: [
        {
          by: 'u-carol',
          at: 14,
          body: 'The third is the most interesting to me. It’s an argument about how we hold beliefs, not just which ones.',
        },
      ],
    },
    {
      by: 'u-ibrahim',
      at: 33,
      body: 'I think the “partly true” case is the weakest.\n\nMill assumes competing half-truths will combine into something better, but public debate often hardens positions instead. Social media is a decent counterexample.\n\nStill, the alternative (someone deciding which half is true) seems worse.',
      replies: [
        {
          by: 'u-emma',
          at: 36,
          body: 'Maybe that is Mill’s real argument: not that discussion works well, but that censorship works even worse.',
        },
        {
          by: 'u-diego',
          at: 40,
          body: 'Counterpoint: Mill was writing for a much smaller public sphere.',
        },
      ],
    },
    {
      by: 'u-hannah',
      at: 52,
      body: 'Question for everyone: does the argument apply to scientific consensus the same way it applies to politics?',
      replies: [
        {
          by: 'u-alice',
          at: 55,
          body: 'I think he’d say yes. He uses Newton’s physics as an example of a belief we can only trust because it stays open to challenge.',
        },
      ],
    },
  ],
  'natural-selection': [
    {
      by: 'u-gabriel',
      at: 6,
      body: 'The breeder analogy is strongest with the pigeons: you can watch selection produce big differences in a few generations.',
      replies: [
        {
          by: 'u-bob',
          at: 9,
          body: 'But breeders choose deliberately. Nature has no goal, which is exactly where Darwin admits the analogy strains.',
        },
      ],
    },
    {
      by: 'u-carol',
      at: 25,
      editedAt: 27,
      body: '“Natural selection is daily and hourly scrutinising… every variation, even the slightest.” The metaphor makes nature sound like an agent, the very misreading he worries about elsewhere.',
    },
  ],
  'wollstonecraft-ch2': [
    {
      by: 'u-emma',
      at: 5,
      body: 'Her core claim: women seem “weak” because they are educated to be, not by nature. It’s an argument about education first and rights second.',
      replies: [
        {
          by: 'u-farah',
          at: 9,
          body: 'Which is why she spends so long arguing against Rousseau’s Sophie.',
        },
        {
          by: 'u-hannah',
          at: 15,
          body: 'Is it fair to call this feminist when she still assumes most women will be wives and mothers?',
        },
        {
          by: 'u-emma',
          at: 17,
          body: 'I think that’s what made it radical for 1792: she argues inside that assumption and still demands equal reason.',
        },
      ],
    },
    {
      by: 'u-ibrahim',
      at: 30,
      body: 'She isn’t attacking individual men so much as a whole curriculum: what girls are taught, and what they are told not to learn.',
    },
    {
      by: 'u-alice',
      at: 48,
      body: 'Short version: virtue requires reason, reason requires education, so denying women education denies them virtue.',
    },
  ],
  'durkheim-rules-ch1': [
    {
      by: 'u-diego',
      at: 12,
      body: 'Social facts: ways of acting that exist outside the individual and constrain them. Language is his clearest example.',
      replies: [
        {
          by: 'u-gabriel',
          at: 16,
          body: 'Fashion too. Nobody decides it alone, but you feel the pressure.',
        },
      ],
    },
    {
      by: 'u-bob',
      at: 22,
      body: 'I don’t fully buy that social facts are “things”. Aren’t they just lots of individual decisions added up?',
      replies: [
        {
          by: 'u-carol',
          at: 25,
          body: 'Durkheim would say the total behaves differently from any individual: suicide rates stay stable year to year even though every case is personal.',
        },
        {
          by: 'u-bob',
          at: 29,
          body: 'Good point. That stability is hard to explain one person at a time.',
        },
      ],
    },
  ],
  'du-bois-souls-ch1': [
    {
      by: 'u-alice',
      at: 3,
      body: 'Double consciousness: “this sense of always looking at one’s self through the eyes of others.” The rest of the chapter builds on this one idea.',
      replies: [
        {
          by: 'u-bob',
          at: 5,
          body: 'The veil image does the same work: you can see out, but others don’t see you clearly.',
        },
        {
          by: 'u-carol',
          at: 6,
          body: 'What surprised me is how personal the opening is, with the visiting-card story.',
        },
        {
          by: 'u-diego',
          at: 8,
          body: 'He frames it as both a burden and a gift: “second-sight”.',
        },
        {
          by: 'u-emma',
          at: 10,
          body: 'The doubleness is in the form too. Every chapter opens with a poem and a bar of music from a spiritual.',
        },
        {
          by: 'u-farah',
          at: 12,
          body: 'Good catch, I hadn’t connected the sorrow songs to the argument.',
        },
      ],
    },
    {
      by: 'u-gabriel',
      at: 20,
      body: '“How does it feel to be a problem?” is such a striking opening question.',
    },
    {
      by: 'u-hannah',
      at: 26,
      editedAt: 27,
      body: 'He argues against both total assimilation and total separation. He wants to be “both a Negro and an American”.',
      replies: [
        {
          by: 'u-ibrahim',
          at: 30,
          body: 'The tension with Booker T. Washington comes out more in Chapter 3, I think.',
        },
      ],
    },
    {
      by: 'u-ibrahim',
      at: 40,
      body: 'Is the “striving” in the title individual or collective? It reads both ways to me.',
    },
    {
      by: 'u-alice',
      at: 52,
      body: 'The economic point near the end: freedom without land, education or the vote was only partial freedom.',
    },
    {
      by: 'u-emma',
      at: 60,
      body: 'Emancipation as a promise the nation has not kept still lands, more than a century later.',
    },
  ],
  'tocqueville-democratie': [
    {
      by: 'u-farah',
      at: 8,
      body: 'Individualism versus selfishness: he calls individualism a calm and considered feeling that slowly withdraws people into private life.',
      replies: [
        {
          by: 'u-diego',
          at: 11,
          body: 'And associations are his cure: civic groups pull people back into public life.',
        },
      ],
    },
    {
      by: 'u-carol',
      at: 20,
      body: 'Interesting that it took a foreign observer to see voluntary associations as so central to American life.',
    },
  ],
}
