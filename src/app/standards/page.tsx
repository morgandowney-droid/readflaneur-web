import { Metadata } from 'next';
import { StandardsContent } from './StandardsContent';

export const metadata: Metadata = {
  title: 'AI Standards & Ethics Policy | Flaneur',
  description: 'Our commitment to AI transparency, editorial integrity, and compliance with global standards including the EU AI Act and C2PA.',
};

export default function StandardsPage() {
  return <StandardsContent />;
}
