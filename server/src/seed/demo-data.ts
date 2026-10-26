/**
 * Extra sample data for trying the app by hand (`npm run seed`). Loaded on top of the base seed in
 * seed/index.ts, which the automated tests use on its own. Chosen to exercise every feature and edge case:
 * a second instructor, a student who never posts, accented names and titles (search), a busy reading
 * with a long thread, a reading with no annotations, long and multi-paragraph posts, edits, and enough
 * spread in who posts how much to use every step of the Participation heat map (counts from 0 to 6).
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
    {
      by: 'u-diego',
      at: 80,
      body: 'He says the remedy for an unjust law is not to wait for a majority to change it. But a majority is exactly what a democracy is for. What is he asking us to put in its place?',
      replies: [
        {
          by: 'u-alice',
          at: 83,
          body: 'Nothing, I think. He calls voting “a sort of gaming” and says the right does not need a majority to be the right. The point is that your conscience is not up for election.',
        },
        {
          by: 'u-diego',
          at: 86,
          body: 'Then why does he pay the highway tax and refuse the poll tax? Where does the line fall?',
        },
        {
          by: 'u-bob',
          at: 89,
          body: 'Complicity. The poll tax goes straight to a government that protects slavery, and he does not want to be implicated in that. A road is just a road.',
        },
        {
          by: 'u-diego',
          at: 92,
          body: 'That feels convenient. Almost every tax funds something somebody objects to.',
        },
        {
          by: 'u-alice',
          at: 95,
          body: 'Which may be his point: you cannot be perfectly clean, but you can refuse to lend your name to the worst of it.',
        },
      ],
    },
    {
      by: 'u-diego',
      at: 100,
      body: 'The night in jail is the only concrete event in the essay. Is the drama in the act itself, or in the writing about it afterward?',
      replies: [
        {
          by: 'u-farah',
          at: 103,
          body: 'The writing, mostly. The essay is the afterlife of the act. Without it, a night in jail is a footnote.',
        },
        {
          by: 'u-hannah',
          at: 106,
          body: 'Worth remembering that the exchange with Emerson (“Henry, what are you doing in there?”) is probably a legend. The legend matters as much as the night.',
        },
      ],
    },
    {
      by: 'u-emma',
      at: 110,
      body: 'He opens with “that government is best which governs least” and within a paragraph upgrades it to “governs not at all.” Is the second version serious, or is it rhetoric?',
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
    {
      by: 'u-bob',
      at: 60,
      body: 'If an opinion is demonstrably false, is silencing it really a harm? Mill’s second case is that even a false view forces the true one to be defended, but that seems to assume someone is still listening.',
      replies: [
        {
          by: 'u-ibrahim',
          at: 63,
          body: 'I read the second case as being about the believer, not the speaker. Without a challenge, the true opinion decays into dogma that nobody can actually defend.',
        },
        {
          by: 'u-bob',
          at: 66,
          body: 'In a seminar, sure. In a public square full of misinformation, I am less convinced the cure is more speech.',
        },
        {
          by: 'u-alice',
          at: 69,
          body: 'He would say more speech is the only cure that does not hand someone the power to decide what is false. But the essay predates algorithmic amplification by a long way.',
        },
        {
          by: 'u-bob',
          at: 72,
          body: '“Collision of adverse opinions” only works if both sides are actually heard. That is the part I doubt now.',
        },
      ],
    },
    {
      by: 'u-carol',
      at: 75,
      body: 'The examples of Socrates and Jesus are chosen to make the reader uneasy about their own certainty. It worked on me.',
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
    {
      by: 'u-carol',
      at: 29,
      body: 'He keeps apologizing for “struggle for existence” (“in a large and metaphorical sense”). It reads like he already knew people would take it literally.',
      replies: [
        {
          by: 'u-gabriel',
          at: 33,
          body: 'They did, for about a century. Social Darwinism is mostly that one phrase taken at face value.',
        },
        {
          by: 'u-carol',
          at: 36,
          body: 'What I find stronger is the breeder comparison: selection with no breeder is the whole idea, and he makes it feel obvious.',
        },
      ],
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
    {
      by: 'u-emma',
      at: 52,
      body: 'She treats the cult of “sensibility” as a trap: women are taught to value charm over strength of mind, then blamed for having no strength of mind.',
      replies: [
        {
          by: 'u-hannah',
          at: 55,
          body: 'And she says outright that Rousseau is the one who set the trap. That passage is the clearest answer to him in the book.',
        },
      ],
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
    {
      by: 'u-gabriel',
      at: 33,
      body: 'The test for a social fact is that it is external and coercive. But isn’t that circular? How do we know a norm is coercive unless somebody breaks it?',
      replies: [
        {
          by: 'u-bob',
          at: 37,
          body: 'He answers this later with suicide rates: the numbers stay stable year to year even as the individuals change. That is his evidence that the pressure is real.',
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
    {
      by: 'u-alice',
      at: 65,
      body: 'Is the veil something imposed on him, or something he lives behind? The first pages seem to say both.',
      replies: [
        {
          by: 'u-ibrahim',
          at: 68,
          body: 'Imposed first, inhabited after. He says he was “born with a veil,” which makes it something done to him before he has a say.',
        },
        {
          by: 'u-alice',
          at: 71,
          body: 'And “second-sight” is framed as a gift and a curse in a single sentence. I do not think he wants to resolve that.',
        },
        {
          by: 'u-emma',
          at: 74,
          body: 'The gift is complicated: he says it gives him no true self-consciousness, only a way of seeing himself through the eyes of others.',
        },
        {
          by: 'u-alice',
          at: 77,
          body: 'That is the double-consciousness sentence, and it is the hinge of the whole chapter.',
        },
        {
          by: 'u-hannah',
          at: 80,
          body: 'Worth reading next to Mill’s chapter. Du Bois’s “two-ness” is the experience of not being free to hold your own opinion of yourself.',
        },
      ],
    },
    {
      by: 'u-gabriel',
      at: 84,
      body: 'Why does he quote the sorrow-song music before the argument begins? Every chapter opens with a few bars and no explanation.',
      replies: [
        {
          by: 'u-ibrahim',
          at: 87,
          body: 'Because the argument is meant to be heard as well as read, I think. The music comes first so you feel it before you analyze it.',
        },
        {
          by: 'u-alice',
          at: 90,
          body: 'The bars come untranslated, too. He trusts the reader to feel before understanding.',
        },
      ],
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
    {
      by: 'u-farah',
      at: 24,
      body: 'His claim that associations are what keep democracy from sliding into isolated individualism feels more relevant now than it probably did in 1840.',
    },
  ],
}
