import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Payment Successful | Flâneur',
};

interface SuccessPageProps {
  searchParams: Promise<{
    session_id?: string;
  }>;
}

export default async function PaymentSuccessPage({ searchParams }: SuccessPageProps) {
  const { session_id } = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?redirect=/advertiser');
  }

  // Fetch the order details if session_id provided
  let orderDetails = null;
  let activationError = null;

  if (session_id) {
    const { data: order } = await supabase
      .from('ad_orders')
      .select('*, ad:ads(*), package:ad_packages(*)')
      .eq('stripe_session_id', session_id)
      .single();

    orderDetails = order;

    // Activate the ad if order exists and is still pending
    if (order && order.status === 'pending') {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + (order.package?.duration_days || 7));

      // Update order status to paid
      const { error: orderUpdateError } = await supabase
        .from('ad_orders')
        .update({ status: 'paid' })
        .eq('id', order.id);

      // Activate the ad with start and end dates
      const { error: adUpdateError } = await supabase
        .from('ads')
        .update({
          status: 'active',
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
        })
        .eq('id', order.ad_id);

      if (orderUpdateError || adUpdateError) {
        activationError = 'Payment received but ad activation failed. Please contact support.';
      }
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-light mb-4">Payment Successful!</h1>

        {activationError ? (
          <p className="text-red-600 mb-6">{activationError}</p>
        ) : (
          <p className="text-neutral-600 mb-6">
            Your ad is now active and will start appearing in feeds shortly.
          </p>
        )}

        {orderDetails && (
          <div className="bg-neutral-50 p-6 mb-6 text-left">
            <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
              Order Details
            </p>
            <p className="font-medium">{orderDetails.ad?.headline}</p>
            <p className="text-sm text-neutral-500">
              {orderDetails.package?.name} - {orderDetails.package?.duration_days} days
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <Link
            href="/advertiser"
            className="bg-black text-white py-3 text-sm tracking-widest uppercase hover:bg-neutral-800 transition-colors"
          >
            View Dashboard
          </Link>
          <Link
            href="/advertiser/ads/new"
            className="border border-black py-3 text-sm tracking-widest uppercase hover:bg-black hover:text-white transition-colors"
          >
            Create Another Ad
          </Link>
        </div>
      </div>
    </div>
  );
}
