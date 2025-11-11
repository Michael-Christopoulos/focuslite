export type Project = {
  id: string;
  name: string;
  color?: string;
};

export type Session = {
  id: string;
  projectId: string;
  startedAt: string;   
  endedAt: string;     
  durationSec: number;
  dayKey: string;      
};
