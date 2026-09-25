export type Question = {
  title: string;
  alternatives: string[];
  correct: number;
};

export type Quiz = {
  id: string;
  title: string;
  level: number;
  category?: string;
  icon: 'toggle' | 'code' | 'git' | 'paint' | 'cloud' | 'device' | 'file';
  questions: Question[];
};

export const QUIZZES: Quiz[] = [];
