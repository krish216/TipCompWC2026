export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Terms &amp; Conditions</h1>
      <p className="text-xs text-gray-400 mb-6">TribePicks · 11outof10 Pty Ltd. (ACN 637 629 219)</p>

      <div className="prose prose-sm max-w-none space-y-4 text-sm text-gray-700">

        <p>Welcome to TribePicks. These Terms &amp; Conditions govern your use of the TribePicks platform
        operated by <strong>11outof10 Pty Ltd. (ACN 637 629 219)</strong> (&quot;we&quot;, &quot;us&quot;, &quot;site owner&quot;).
        By registering or using this site you agree to these terms in full.</p>

        <h2 className="text-base font-bold text-gray-900 mt-6">1. Definitions</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Participant</strong> — a registered user who enters tips in a competition.</li>
          <li><strong>Site owner</strong> — 11outof10 Pty Ltd. (ACN 637 629 219), owner and operator of TribePicks.</li>
          <li><strong>Comp owner</strong> — a user who creates and administers a tipping competition, sets comp rules, entry fees (if any) and prizes.</li>
          <li><strong>Round</strong> — a set of matches made available for tipping as listed on the site.</li>
          <li><strong>Season</strong> — the full series of rounds for a tournament as listed on the site.</li>
        </ul>

        <h2 className="text-base font-bold text-gray-900 mt-6">2. Registration</h2>
        <p>Registration on TribePicks is free. Entry into a tipping competition may incur an entry fee
        as determined by the comp owner. By registering you confirm you are at least 18 years of age
        (or the minimum age required in your jurisdiction) and that all information provided is
        accurate.</p>

        <h2 className="text-base font-bold text-gray-900 mt-6">3. Entry Conditions</h2>
        <p>Participants must comply with these Terms at all times. The comp owner or site owner
        reserves the right to disqualify any participant whose conduct or entries do not comply.
        Entry into any competition constitutes acceptance of these Terms.</p>
        <p>Each participant may register once and submit one set of tips per round. The comp owner
        may verify participant identity at any time. Multiple registrations by the same individual
        may result in disqualification.</p>
        <p>The comp owner may refuse registration for any entry that is defamatory, offensive or
        created using automated tools, as determined at their absolute discretion.</p>

        <h2 className="text-base font-bold text-gray-900 mt-6">4. Tipping Rules</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Participants must submit predictions before the lockout time for each round as shown on the site.</li>
          <li>Tips not entered before lockout earn zero points — there are no default selections.</li>
          <li>Points for correct selections are set out in each competition&apos;s rules.</li>
          <li>If a match is cancelled and not rescheduled within three days, all tips for that match score zero.</li>
          <li>Rescheduled matches move to the round closest to their new date; prior tips are not transferred.</li>
          <li>Round rankings are determined within 72 hours of the last match in that round.</li>
        </ul>

        <h2 className="text-base font-bold text-gray-900 mt-6">5. Entry Fees &amp; Prizes</h2>
        <p>Entry fees (if any) are set and collected by the comp owner. The site owner accepts no
        responsibility for entry fees or their distribution. Prizes (if any) are set by the comp owner
        who is solely responsible for distributing them. The site owner accepts no liability for prizes.</p>

        <h2 className="text-base font-bold text-gray-900 mt-6">6. Disputes</h2>
        <p>Tipping competitions are self-policed by comp owners and participants. The site owner does
        not monitor private competitions. In the event of any dispute the decision of the comp owner
        is final. The site owner will not enter into correspondence regarding private competition
        disputes.</p>

        <h2 className="text-base font-bold text-gray-900 mt-6">7. Liability</h2>
        <p>To the extent permitted by law, 11outof10 Pty Ltd. (ACN 637 629 219) and the comp owner are not liable for:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Tips not received, corrupted or rejected by the server.</li>
          <li>Site downtime or unavailability.</li>
          <li>Loss or damage arising from participation in any competition.</li>
          <li>Unauthorised access or third-party interference.</li>
          <li>Any tax liability incurred by a participant or prize winner.</li>
        </ul>

        <h2 className="text-base font-bold text-gray-900 mt-6">8. Privacy</h2>
        <p>Personal information provided during registration is used to manage your participation and
        to display your display name and score on leaderboards. We will not sell your personal
        information to third parties. By registering you consent to your display name and score being
        shown publicly within your competition. Please refer to our <a href="/privacy" className="text-blue-600 underline">Privacy Policy</a> for full details.</p>

        <h2 className="text-base font-bold text-gray-900 mt-6">9. Changes to Terms</h2>
        <p>11outof10 Pty Ltd. (ACN 637 629 219) reserves the right to modify these Terms at any time. Continued use of
        the site after changes are posted constitutes acceptance of the revised Terms.</p>

        <h2 className="text-base font-bold text-gray-900 mt-6">10. Governing Law</h2>
        <p>These Terms are governed by the laws of New South Wales, Australia. Any disputes are
        subject to the exclusive jurisdiction of the courts of New South Wales.</p>

        <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-400">
          <p>11outof10 Pty Ltd. (ACN 637 629 219) · TribePicks · Last updated April 2026</p>
        </div>
      </div>
    </div>
  )
}
