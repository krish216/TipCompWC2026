export const metadata = { title: 'Privacy Policy — TribePicks' }

const LAST_UPDATED = '30 April 2026'
const CONTACT_EMAIL = 'privacy@tribepicks.com'
const APP_NAME = 'TribePicks'
const OPERATOR = '11outof10 Pty Ltd. (ACN 637 629 219)'

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: {LAST_UPDATED}</p>

      <div className="prose prose-sm max-w-none text-gray-700 space-y-8">

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-2">1. About this policy</h2>
          <p>
            {APP_NAME} ("we", "us", "our") is operated by {OPERATOR}. This Privacy Policy explains how
            we collect, use, store and disclose your personal information when you use the {APP_NAME}
            web application (the "Service"). It is prepared in accordance with the{' '}
            <em>Privacy Act 1988</em> (Cth) and the Australian Privacy Principles (APPs).
          </p>
          <p className="mt-2">
            By registering for or using the Service, you agree to the collection and use of information
            in accordance with this policy. If you do not agree, please do not use the Service.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-2">2. Information we collect</h2>
          <p className="mb-2">We collect the following personal information when you register and use the Service:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Account information:</strong> email address, display name, password (stored as a one-way hash — we never store your plain-text password)</li>
            <li><strong>Profile information:</strong> country, timezone, favourite World Cup team, profile photo (optional)</li>
            <li><strong>Usage data:</strong> match predictions you submit, points earned, leaderboard rankings, tribe membership</li>
            <li><strong>Organisation data:</strong> the organisation you belong to, any tribe you join</li>
            <li><strong>Technical data:</strong> browser type, IP address, and session data collected automatically by our hosting and authentication provider</li>
          </ul>
          <p className="mt-2">We do not collect payment card information directly. Payments (where applicable) are processed by a third-party payment processor and we receive only a payment reference.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-2">3. How we use your information</h2>
          <p className="mb-2">We use the information we collect to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Create and manage your account</li>
            <li>Display your predictions, points and rankings on leaderboards visible to other players</li>
            <li>Enable tribe and organisation features, including chat and announcements</li>
            <li>Send transactional emails (account verification, password reset) — these are not marketing emails</li>
            <li>Administer paid organisation subscriptions</li>
            <li>Improve and maintain the Service</li>
            <li>Comply with our legal obligations</li>
          </ul>
          <p className="mt-2">
            We will not use your personal information for direct marketing without your explicit consent,
            and we will not sell your personal information to any third party.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-2">4. Leaderboard visibility</h2>
          <p>
            Your display name, total points, and tribe/organisation name are visible to other registered
            users on the leaderboard. Your email address, country, timezone and favourite team are{' '}
            <strong>never</strong> displayed publicly. If you do not want your display name shown on leaderboards,
            you may delete your account at any time (see section 8).
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-2">5. Disclosure to third parties</h2>
          <p className="mb-2">We use the following third-party service providers who may process your data on our behalf:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Supabase Inc.</strong> — database, authentication and file storage. Data is stored on servers in the United States (or Australia if applicable). Supabase is SOC 2 Type II certified.</li>
            <li><strong>Vercel Inc.</strong> — web hosting and deployment. Servers are located in the United States.</li>
            <li><strong>Resend Inc.</strong> — transactional email delivery.</li>
          </ul>
          <p className="mt-2">
            We do not disclose your personal information to any other third parties except where required by
            Australian law or a court order.
          </p>
          <p className="mt-2">
            By using the Service you acknowledge that your data may be transferred to and stored in countries
            outside Australia, including the United States, which may have different data protection laws.
            We take reasonable steps to ensure these providers handle your data securely.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-2">6. Cookies and tracking</h2>
          <p>
            The Service uses cookies and local storage solely for authentication session management.
            We do not use advertising cookies, tracking pixels, or third-party analytics that identify
            individual users. We do not display advertisements.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-2">7. Data retention</h2>
          <p>
            We retain your personal information for as long as your account is active. Prediction history
            and leaderboard data may be retained in aggregate (de-identified) form after account deletion
            to maintain historical tournament records. Identifiable data is deleted within 30 days of an
            account deletion request.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">8. Your rights</h2>
          <p className="mb-2">Under the Australian Privacy Principles you have the right to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Access</strong> the personal information we hold about you</li>
            <li><strong>Correct</strong> inaccurate or out-of-date personal information</li>
            <li><strong>Delete</strong> your account and associated personal data</li>
            <li><strong>Complain</strong> about how we have handled your personal information</li>
          </ul>
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-blue-800 mb-1">Delete your account</p>
            <p className="text-sm text-blue-700">
              You can permanently delete your account and all associated personal data directly from the{' '}
              <a href="/settings" className="underline font-medium">Settings page</a>. This is immediate and cannot be undone.
              Your predictions, points, and tribe membership will be permanently removed from all leaderboards.
            </p>
          </div>
          <p className="mt-3">
            To exercise any other rights, or to make a complaint, contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 underline">{CONTACT_EMAIL}</a>.
            We will respond within 30 days.
          </p>
          <p className="mt-2">
            If you are not satisfied with our response to a complaint, you may lodge a complaint with the{' '}
            <a href="https://www.oaic.gov.au" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
              Office of the Australian Information Commissioner (OAIC)
            </a>.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-2">9. Security</h2>
          <p>
            We take reasonable steps to protect your personal information from misuse, loss, and unauthorised
            access. Measures include encrypted storage, hashed passwords, row-level security on all database
            tables, HTTPS-only access, and authentication via industry-standard JWT tokens. No internet
            transmission is completely secure, however, and we cannot guarantee the security of information
            transmitted to the Service.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-2">10. Children</h2>
          <p>
            The Service is not directed at children under 13 years of age. We do not knowingly collect
            personal information from children under 13. If you believe we have inadvertently collected
            such information, please contact us immediately at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 underline">{CONTACT_EMAIL}</a>.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-2">11. Changes to this policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify registered users of
            material changes by email or by a prominent notice on the Service. The "Last updated" date
            at the top of this page will always reflect the most recent version.
            Continued use of the Service after changes are posted constitutes acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-2">12. Contact us</h2>
          <p>
            For any privacy-related questions, access requests, or complaints, contact us at:
          </p>
          <div className="mt-2 bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm">
            <p className="font-semibold">{OPERATOR}</p>
            <p className="mt-1">
              Email:{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 underline">{CONTACT_EMAIL}</a>
            </p>
          </div>
        </section>

        <div className="border-t border-gray-200 pt-6 text-[11px] text-gray-400">
          <p>
            This privacy policy was prepared with reference to the{' '}
            <em>Privacy Act 1988</em> (Cth) and the Australian Privacy Principles.
            TribePicks is an unofficial fan competition and is not affiliated with or endorsed by FIFA,
            the FIFA World Cup™, or any associated national football federation.
          </p>
        </div>
      </div>
    </div>
  )
}
