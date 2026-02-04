import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-white py-12 md:py-16">
      <div className="mx-auto max-w-5xl px-6 text-center">
        {/* Logo */}
        <div className="mb-10">
          <Link href="/" className="font-display text-2xl tracking-[0.35em] font-light text-neutral-900 hover:opacity-70 transition-opacity">
            FLÂNEUR
          </Link>
        </div>

        {/* Navigation */}
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 mb-10">
          <Link href="/about" className="text-sm text-neutral-600 hover:text-black transition-colors">
            About
          </Link>
          <Link href="/advertise" className="text-sm text-neutral-600 hover:text-black transition-colors">
            Advertise
          </Link>
          <Link href="/careers" className="text-sm text-neutral-600 hover:text-black transition-colors">
            Careers
          </Link>
          <Link href="/contact" className="text-sm text-neutral-600 hover:text-black transition-colors">
            Contact
          </Link>
          <Link href="/legal" className="text-sm text-neutral-600 hover:text-black transition-colors">
            Legal
          </Link>
          <Link href="/standards" className="text-sm text-neutral-600 hover:text-black transition-colors">
            AI Standards & Ethics
          </Link>
        </div>

        {/* Copyright */}
        <div className="pt-8 border-t border-neutral-100">
          <p className="text-[11px] tracking-[0.15em] text-neutral-400">
            &copy; {new Date().getFullYear()} Flâneur. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
