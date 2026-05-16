/* global React, AxhyShell, AxhyData, AxhyChatTab, AxhyTodayTab, AxhyDecisionsTab, AxhyActivityTab, AxhyProfile, AxhyMultiDayLeaveScreen, AxhyTerminationScreen */

const { PhoneFrame, TabBar, MicFAB, Drawer } = AxhyShell;
const { Profile } = AxhyProfile;

function PhoneApp({ initialTab = 'today', persona, label, sublabel }) {
  const [tab, setTab] = React.useState(initialTab);
  const [listening, setListening] = React.useState(false);
  // r3 — drawer overlay state (rarely-used surfaces: profile, rules, help, sign out)
  // Per friend's lock 2026-05-11: bottom nav + top app bar with hamburger drawer.
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  // Amend mode now routes to Decisions Workspace (was: chat) per 2026-05-11 reframing
  const [pendingAmendId, setPendingAmendId] = React.useState(null);
  // Heavy decision drill screen
  const [openHeavyDecision, setOpenHeavyDecision] = React.useState(null);

  // "Amend" now means "open the related decision in Decisions Workspace"
  // (was: route through chat for parsing). Reframing: AI Chat is messy-input
  // entry, Decisions Workspace is where supervisor confirms.
  const handleAmend = (decisionId) => {
    setPendingAmendId(decisionId);
    setTab('decisions');
  };

  const handleOpenHeavy = (d) => setOpenHeavyDecision(d);

  const showMic = tab !== 'profile';

  const onMenu = () => setDrawerOpen(true);

  const renderTab = () => {
    switch (tab) {
      case 'today':
        return <AxhyTodayTab persona={persona} onAmend={handleAmend} onMenu={onMenu} />;
      case 'decisions':
        return (
          <AxhyDecisionsTab
            persona={persona}
            pendingAmendId={pendingAmendId}
            onClearAmend={() => setPendingAmendId(null)}
            onOpenHeavy={handleOpenHeavy}
            onMenu={onMenu}
          />
        );
      case 'activity':
        return <AxhyActivityTab persona={persona} onMenu={onMenu} />;
      case 'chat':
        return (
          <AxhyChatTab
            persona={persona}
            listening={listening}
            onMicToggle={() => setListening(!listening)}
            pendingAmendId={pendingAmendId}
            onClearAmend={() => setPendingAmendId(null)}
            onOpenHeavy={handleOpenHeavy}
            onMenu={onMenu}
          />
        );
      case 'profile':
      default:
        return <Profile persona={persona} />;
    }
  };

  // For tabs that scroll under the tab bar, use scrollable inner container
  const scrolling = tab === 'profile';

  return (
    <PhoneFrame label={label} sublabel={sublabel}>
      <AxhyShell.StatusBar />
      {scrolling ? (
        <div className="qbar field-mobile" style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {renderTab()}
        </div>
      ) : (
        <div
          className="field-mobile"
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          {renderTab()}
        </div>
      )}
      {showMic && <MicFAB listening={listening} onPress={() => setListening(!listening)} />}
      <TabBar active={tab} onChange={setTab} />
      {openHeavyDecision && openHeavyDecision.tier === 'employment' && (
        <AxhyTerminationScreen
          decision={openHeavyDecision}
          onClose={() => setOpenHeavyDecision(null)}
        />
      )}
      {openHeavyDecision &&
        openHeavyDecision.tier === 'personnel' &&
        openHeavyDecision.multiDay && (
          <AxhyMultiDayLeaveScreen
            decision={openHeavyDecision}
            onClose={() => setOpenHeavyDecision(null)}
          />
        )}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} persona={persona} />
    </PhoneFrame>
  );
}

window.AxhyPhoneApp = PhoneApp;
