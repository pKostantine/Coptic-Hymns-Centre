import type { BookTheme } from './bookTheme';

export type Testament = 'OT' | 'NT';

type Gradient = readonly [string, string, string];

export interface BibleSection {
  english: string;
  arabic: string;
  /** The first `bookOrder` of the group; a group runs until the next one begins. */
  from: number;
  gradient: Gradient;
}

interface TestamentLook {
  english: string;
  arabic: string;
  theme: BookTheme;
  /** Each testament's opening words, set on its cover. */
  verse: { english: string; arabic: string };
  range: { english: string; arabic: string };
  sections: BibleSection[];
}

/**
 * The two testaments as the Bible's menus show them, in the Bible's bronze:
 * the Old a deeper umber, the New a brighter gold. Each testament's books are
 * grouped as the Church reads them, in `bible.books` order — the Twelve
 * Prophets before the Major Prophets, as in the Septuagint.
 */
export const TESTAMENTS: Record<Testament, TestamentLook> = {
  OT: {
    english: 'Old Testament',
    arabic: 'العهد القديم',
    theme: { gradient: ['#6B4A10', '#352407', '#171003'], accent: '#F2DFA8' },
    verse: {
      english: '“In the beginning God created the heavens and the earth.”',
      arabic: '«في البدء خلق الله السماوات والأرض»',
    },
    range: { english: 'Genesis – Daniel', arabic: 'من التكوين إلى دانيال' },
    sections: [
      { english: 'The Law', arabic: 'الشريعة', from: 1, gradient: ['#5E420E', '#2E2007', '#171003'] },
      { english: 'The Historical Books', arabic: 'الأسفار التاريخية', from: 6, gradient: ['#4E3C14', '#271E09', '#140F04'] },
      { english: 'Psalms & Wisdom', arabic: 'المزامير وأسفار الحكمة', from: 24, gradient: ['#655012', '#322808', '#191404'] },
      { english: 'The Twelve Prophets', arabic: 'الأنبياء الصغار', from: 31, gradient: ['#5A3512', '#2D1A08', '#170D04'] },
      { english: 'The Major Prophets', arabic: 'الأنبياء الكبار', from: 43, gradient: ['#63381A', '#321C0B', '#190E05'] },
    ],
  },
  NT: {
    english: 'New Testament',
    arabic: 'العهد الجديد',
    theme: { gradient: ['#8A6516', '#45320A', '#1C1404'], accent: '#FFE7A6' },
    verse: {
      english: '“In the beginning was the Word… and the Word was God.”',
      arabic: '«في البدء كان الكلمة… وكان الكلمة الله»',
    },
    range: { english: 'Matthew – Revelation', arabic: 'من متى إلى الرؤيا' },
    sections: [
      { english: 'Gospels & Acts', arabic: 'الأناجيل وسفر الأعمال', from: 50, gradient: ['#7E5C14', '#3F2E0A', '#1C1404'] },
      { english: 'The Pauline Epistles', arabic: 'رسائل البولس', from: 55, gradient: ['#5E4611', '#2F2308', '#171104'] },
      { english: 'The Catholic Epistles', arabic: 'رسائل الكاثوليكون', from: 69, gradient: ['#54401A', '#2A200C', '#151006'] },
      { english: 'The Apocalypse', arabic: 'سفر الرؤيا', from: 76, gradient: ['#6A2E14', '#35170A', '#1A0B05'] },
    ],
  },
};

/** Which of a testament's groups a book belongs to — the last one that begins at or before it. */
export function sectionIndexFor(testament: Testament, bookOrder: number): number {
  const { sections } = TESTAMENTS[testament];
  for (let index = sections.length - 1; index > 0; index -= 1) {
    if (bookOrder >= sections[index].from) return index;
  }
  return 0;
}
