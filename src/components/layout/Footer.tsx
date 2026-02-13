import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-border bg-canvas py-12 md:py-16">
      <div className="mx-auto max-w-5xl px-6 text-center">
        {/* Logo */}
        <div className="mb-10">
          <Link href="/" className="font-display text-2xl tracking-[0.35em] font-light text-fg hover:opacity-70 transition-opacity">
            FLÂNEUR
          </Link>
        </div>

        {/* Navigation */}
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 mb-10">
          <Link href="/about" className="text-sm text-fg-muted hover:text-fg transition-colors">
            About
          </Link>
          <Link href="/advertise" className="text-sm text-fg-muted hover:text-fg transition-colors">
            Advertise
          </Link>
          <Link href="/careers" className="text-sm text-fg-muted hover:text-fg transition-colors">
            Careers
          </Link>
          <Link href="/contact" className="text-sm text-fg-muted hover:text-fg transition-colors">
            Contact
          </Link>
          <Link href="/legal" className="text-sm text-fg-muted hover:text-fg transition-colors">
            Legal
          </Link>
          <Link href="/standards" className="text-sm text-fg-muted hover:text-fg transition-colors">
            AI Standards & Ethics
          </Link>
        </div>

        {/* Copyright */}
        <div className="pt-8 border-t border-border">
          <p className="text-[11px] tracking-[0.15em] text-fg-muted">
            &copy; {new Date().getFullYear()} Flâneur. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
