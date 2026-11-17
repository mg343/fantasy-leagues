// Starter kits. Everything here is editable in the lobby before the draft.
const c = (name, pts) => ({ name, pts });

export const TEMPLATES = [
  {
    id: 'semester', emoji: '🎓', title: 'Semester League', blurb: 'Draft your friends. Score their academic chaos.',
    suggest: 'Finals Week Fantasy', poolHint: 'Your friends, classmates, that one TA…',
    cats: [c('Aces an exam (A or better)', 10), c('Pulls an all-nighter', 4), c('Goes to office hours', 3), c('Professor knows their name', 2),
      c('Skips class', -3), c('Falls asleep in lecture', -2), c('Late submission', -4), c('Drops a class', -10)],
  },
  {
    id: 'press', emoji: '📰', title: 'Press Box', blurb: 'Journalists are athletes. Bylines are touchdowns.',
    suggest: 'The Byline Bowl', poolHint: 'Reporters, columnists, newsletter people…',
    cats: [c('Scoop / exclusive', 10), c('Front page or homepage lead', 8), c('Cited by a rival outlet', 4), c('TV or podcast hit', 3),
      c('Wins an award', 15), c('Posts through it (ratioed)', -3), c('Correction appended', -6), c('Buried the lede', -2)],
  },
  {
    id: 'capitol', emoji: '🏛️', title: 'Capitol Fantasy', blurb: 'Draft politicians. Root for floor speeches.',
    suggest: 'Filibuster Fantasy', poolHint: 'Senators, reps, governors, mayors…',
    cats: [c('Bill passes a chamber', 10), c('Viral hearing clip', 4), c('Sunday show appearance', 3), c('Marathon floor speech', 5),
      c('Lands a big endorsement', 2), c('Gaffe makes headlines', -4), c('Scandal headline', -8), c('Misses a vote', -2)],
  },
  {
    id: 'reality', emoji: '🌹', title: 'Reality TV', blurb: 'Bachelor, Survivor, Love Island — any cast.',
    period: 'Episode',
    suggest: 'Not Here To Make Friends', poolHint: 'This season’s cast…',
    cats: [c('Survives the episode', 5), c('Wins a challenge', 8), c('Starts drama', 3), c('Cries on camera', 2), c('Kiss', 4),
      c('“I’m not here to make friends”', 6), c('Eliminated', -5), c('Leaves voluntarily', -8)],
  },
  {
    id: 'founders', emoji: '🚀', title: 'Founder Mode', blurb: 'Tech CEOs and startups, scored like running backs.',
    suggest: 'Series A Fantasy', poolHint: 'Founders, CEOs, VCs, companies…',
    cats: [c('Ships a product', 6), c('Raises a round', 10), c('Podcast appearance', 2), c('Stock up 5%+ on the week', 5),
      c('Posts something unhinged', -3), c('Gets sued', -6), c('Layoffs', -8), c('“Excited to announce”', 1)],
  },
  {
    id: 'house', emoji: '🏠', title: 'House League', blurb: 'Roommates & the group chat, finally held accountable.',
    suggest: 'The Chore Wars', poolHint: 'Everyone in the house or group chat…',
    cats: [c('Cooks for the group', 5), c('Does the dishes unprompted', 3), c('Hits the gym', 2), c('Goes on a date', 5),
      c('Late to plans', -3), c('Bails last minute', -6), c('Texts the ex', -5), c('Leaves a voicemail', 1)],
  },
  {
    id: 'blank', emoji: '✨', title: 'Blank Slate', blurb: 'Anything else. Birds at your feeder. Coworkers. Stocks.',
    suggest: '', poolHint: 'Whoever or whatever you’re drafting…',
    cats: [c('Did something great', 5), c('Did something good', 2), c('Did something bad', -3)],
  },
];
