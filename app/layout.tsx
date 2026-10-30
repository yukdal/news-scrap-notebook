import type { Metadata } from 'next';
export const metadata: Metadata = {
 title:'경제신문읽기 · 매일 읽고, 나의 언어로',
 description:'기간 제한 없이 경제신문을 읽고 기록하세요. 계정별 동기화, 인증 이미지와 나만의 용어장.',
 icons:{icon:'/assets/favicon.svg'},
};
export default function RootLayout({children}:{children:React.ReactNode}) {
 return <html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="theme-color" content="#f7f5ef"/><link rel="stylesheet" href="/styles.css?v=2"/></head><body>{children}</body></html>;
}
