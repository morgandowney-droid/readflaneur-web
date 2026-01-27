import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-white py-8">
      <div className="mx-auto max-w-5xl px-4 text-center">
        <div className="flex justify-center gap-12 mb-6">
          <div>
            <h4 className="text-xs tracking-widest uppercase text-neutral-400 mb-3">
              Business
            </h4>
            <ul className="space-y-1">
              <li>
                <Link href="/advertise" className="text-sm hover:underline">
                  Advertise
                </Link>
              </li>
              <li>
                <Link href="/careers" className="text-sm hover:underline">
                  Careers
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-sm hover:underline">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs tracking-widest uppercase text-neutral-400 mb-3">
              Legal
            </h4>
            <ul className="space-y-1">
              <li>
                <Link href="/privacy" className="text-sm hover:underline">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-sm hover:underline">
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-6 border-t border-neutral-100 text-xs text-neutral-400">
          &copy; {new Date().getFullYear()} Flâneur. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
