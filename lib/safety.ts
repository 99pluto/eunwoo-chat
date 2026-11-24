// 위기 신호 키워드. 사용자가 이런 말을 하면 화면 위에 도움받을 수 있는 연락처를 띄운다.
// 키워드 매칭은 보조 장치일 뿐이며, 모델의 시스템 프롬프트에도 같은 원칙이 들어 있다.
const CRISIS_PATTERNS = [
  '죽고 싶', '죽고싶', '자살', '자해', '사라지고 싶', '사라지고싶',
  '살기 싫', '살기싫', '끝내고 싶', '끝내고싶', '목숨', '극단적',
];

export function hasCrisisSignal(text: string): boolean {
  const t = text.replace(/\s+/g, ' ');
  return CRISIS_PATTERNS.some((p) => t.includes(p));
}

export const HELP_LINES = [
  { label: '자살예방상담전화', number: '109', note: '24시간' },
  { label: '정신건강위기상담', number: '1577-0199', note: '24시간' },
];
