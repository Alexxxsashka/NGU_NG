export const leadershipLabels={
 member:'Учасник',
 commander:'Командир підрозділу',
 deputy:'Заступник командира',
 leadership:'Керівний склад',
} as const;
export type LeadershipRole=keyof typeof leadershipLabels;
