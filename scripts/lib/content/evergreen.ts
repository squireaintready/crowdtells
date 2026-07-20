/**
 * Evergreen content for the /learn explainers and /event hubs — authored and
 * fact-checked by the content pipeline, hand-editable thereafter. Rendered by
 * scripts/lib/pages.ts (which owns the live-market matchers + the template).
 */

export interface EvergreenSection {
  heading: string;
  body: string;
}

export interface EvergreenFaq {
  q: string;
  a: string;
}

export interface EvergreenPage {
  slug: string;
  title: string;
  h1: string;
  metaDescription: string;
  intro: string;
  sections: EvergreenSection[];
  faq: EvergreenFaq[];
  relatedTopics?: string[];
  /** Labeled advertorial: renders a visible "Sponsored" badge + disclosure and
   * marks every outbound link rel="sponsored". Keep OFF for editorial content. */
  sponsored?: boolean;
}

export const EXPLAINERS: EvergreenPage[] = [
  {
    slug: 'how-prediction-markets-work',
    title: 'How Prediction Markets Work',
    h1: 'How Prediction Markets Work',
    metaDescription:
      'A plain explainer of how prediction markets work: contracts that pay $1 if an event happens, why prices read as crowd probabilities, and where they fall short.',
    intro:
      "A prediction market is an exchange where people buy and sell contracts tied to a future event, such as who wins an election or whether a rate cut happens by a certain date. Each contract is designed to pay $1 if the event occurs and $0 if it does not, so its price, quoted from 0 to 100 cents, can be read as the crowd's estimated probability. A contract trading at 63 cents implies roughly a 63 percent chance. These are probabilities produced by trading, not predictions of certainty or financial advice.",
    sections: [
      {
        heading: 'The core mechanism: a $1 binary contract',
        body: 'Most prediction markets run on binary, or yes/no, contracts. The exchange defines a clear question with a fixed resolution date and a rule for deciding the outcome, for example: "Will Candidate A win the election?" Each "Yes" share pays out $1 if the answer turns out to be yes, and nothing if it turns out to be no. "No" shares pay the reverse.\n\nBecause the maximum payout is $1, the price can only sit between $0 and $1, usually quoted in cents. Buyers and sellers meet in an order book or are matched by an automated market maker, the same way a stock exchange pairs trades. When more people want to buy "Yes" than sell it, the price rises; when sentiment cools, it falls. When the event finally happens or fails to happen, the market resolves: winning shares are redeemed for $1 each and losing shares expire worthless.',
      },
      {
        heading: 'Why the price reads as a probability',
        body: 'The link between price and probability comes from simple expected value. If you believe an event has a 70 percent chance of happening, a "Yes" share is worth 70 cents to you on average: 70 percent of the time it pays $1, and 30 percent of the time it pays nothing, which works out to about $0.70.\n\nIf the share were trading at only 50 cents, you would expect to profit by buying it, and so would others, pushing the price up. If it traded at 90 cents, sellers would step in and push it down. The price settles where buyers and sellers roughly balance, which is the level the marketplace collectively treats as the implied odds. This is why analysts often say the price "is" the implied probability. It is the number at which informed money stops finding an obvious edge. In practice, fees, the bid-ask spread, and the small cost of tying up money until resolution mean the reading is an approximation rather than an exact figure.',
      },
      {
        heading: 'A worked example',
        body: 'Suppose a market asks whether a central bank will cut interest rates at its next meeting. Early on, with little information, "Yes" trades at 40 cents, an implied 40 percent chance.\n\nThen a weak jobs report is published, making a cut look more likely. Traders who think the real probability is now higher buy "Yes," and the price climbs to 58 cents. A trader who bought at 40 cents can now sell at 58 cents for a gain, without waiting for the meeting, just as a stockholder can sell before a company reports earnings. If the meeting arrives and the bank does cut, the market resolves: every "Yes" share pays $1, so anyone holding from 40 cents earns 60 cents per share, while "No" shares pay nothing. The moving price chart is, in effect, a real-time record of how the crowd\'s confidence shifted as news arrived.',
      },
      {
        heading: 'Who trades, and why the signal can be useful',
        body: "Participants range from hobbyists and political junkies to professional traders and people hedging real exposure, such as a business worried about a policy change. The mix matters: traders are risking their own money, which rewards being right and punishes wishful thinking, unlike a free opinion poll.\n\nThis incentive is why prediction-market prices can aggregate scattered information well. In one long-running academic example, the Iowa Electronic Markets, run by the University of Iowa's Tippie College of Business, were found to be closer to the final result than polls about 74 percent of the time in a study of 964 polls spanning the 1988 to 2004 U.S. presidential elections. Some researchers have since questioned how directly market prices and same-day polls should be compared, so the edge over polls is real but debated rather than absolute. Venues such as Kalshi, a U.S. exchange regulated by the Commodity Futures Trading Commission, and Polymarket, which originated as a crypto-based platform, now run large numbers of markets on politics, economics, and other topics.",
      },
      {
        heading: 'The real limitations',
        body: 'Prediction markets are not crystal balls, and several well-documented flaws can distort the price.\n\nLow liquidity. In a market with few traders and little money, a single sizable order can swing the price far more than new information warrants. Thinly traded contracts are noisy and should be read with caution.\n\nManipulation. Because the price is itself a public signal, a participant may push it to influence perception or to mislead less informed traders. Large "whale" positions have visibly moved prices in real episodes.\n\nLong-shot bias. Research repeatedly finds that very unlikely outcomes tend to be overpriced and heavy favorites underpriced, a pattern called the favorite-longshot bias. A study of Kalshi contracts found that those bought for under 10 cents lost, on average, well over half their value, meaning rare events priced at a few cents tend to win even less often than the price suggests.\n\nThe practical takeaway: treat a market price as a useful, money-weighted estimate of probability, best on liquid, heavily traded questions, and never as a guarantee or a recommendation to bet.',
      },
    ],
    faq: [
      {
        q: 'What does a prediction market price actually mean?',
        a: "The price, quoted from 0 to 100 cents, is the crowd's implied probability that an event will happen. A contract at 63 cents implies roughly a 63 percent chance, because each share pays $1 if the event occurs and $0 if it does not. It is an estimate produced by trading, not a certainty or financial advice.",
      },
      {
        q: 'Are prediction markets more accurate than polls?',
        a: 'Often, but not always. Because traders risk real money, prices can aggregate information efficiently. A long-running study of the Iowa Electronic Markets found they beat polls about 74 percent of the time across the 1988 to 2004 U.S. presidential elections, though that comparison has been debated. Accuracy is weakest in thinly traded markets and for very low-probability outcomes.',
      },
      {
        q: 'How do you make money in a prediction market?',
        a: 'You buy "Yes" or "No" contracts at a price you think is too low, then either hold until the event resolves, when winning shares pay $1, or sell earlier if the price moves your way. As with any trading, you can also lose your stake. Prediction markets carry real financial risk and are not advice.',
      },
      {
        q: 'What is the favorite-longshot bias?',
        a: 'It is a well-documented tendency for very unlikely outcomes to be overpriced and strong favorites to be underpriced. Studies, including research on Kalshi, found contracts bought for under 10 cents lost most of their value on average, meaning rare events tend to win even less often than their low price implies.',
      },
      {
        q: 'Are prediction markets legal in the United States?',
        a: "Some are. Kalshi operates as an exchange regulated by the Commodity Futures Trading Commission, and Polymarket began returning to the U.S. in late 2025 under a CFTC order, with access running through regulated intermediaries. Availability can vary by state and the legal landscape keeps shifting, so check each platform's current status for your location before participating.",
      },
    ],
    relatedTopics: ['Politics', 'Economics', 'Finance', 'Crypto'],
  },
  {
    slug: 'what-is-polymarket',
    title: 'What Is Polymarket? A Plain Guide',
    h1: 'What Is Polymarket?',
    metaDescription:
      'Polymarket is a USDC-based prediction market where people trade on real-world events. Learn how it works, what it covers, and its US regulatory status.',
    intro:
      'Polymarket is one of the world\'s largest prediction markets: an online platform where people trade contracts tied to the outcome of real-world events, from elections to interest-rate decisions to sports. Founded in 2020 by Shayne Coplan and built on cryptocurrency rails, it lets traders buy and sell "yes" or "no" shares whose prices move with the crowd\'s expectations. Those prices act as a running estimate of how likely an event is — a probability, not a guarantee or financial advice.',
    sections: [
      {
        heading: 'The basics: what Polymarket is',
        body: "Polymarket is an event-based trading platform where each market poses a clear question with a defined resolution, such as whether a particular candidate will win an election or whether an economic indicator will cross a threshold by a set date. Participants take positions on the answer, and the market settles once the real-world outcome is known.\n\nIt was founded in June 2020 by Shayne Coplan, then in his early twenties, and is headquartered in New York City. Over the following years it grew into one of the most-used prediction markets by trading volume, drawing attention from technologists, investors, and journalists tracking how crowds price uncertainty.\n\nUnlike a poll, which asks people what they think, a prediction market asks people to put money behind what they think. The premise is that aggregating many self-interested forecasts can produce a sharp, continuously updating estimate of an event's likelihood.",
      },
      {
        heading: 'How trading works',
        body: 'Polymarket runs on cryptocurrency infrastructure: traders deposit USDC, a US-dollar-pegged stablecoin, and transactions are recorded on the Polygon blockchain. This is what people mean when they call it a crypto-based platform — the unit of account is a stable, dollar-linked token rather than a traditional bank balance.\n\nMost markets are binary, offering "Yes" and "No" shares. Each share pays out 1 dollar if its side is correct and 0 if it is not, so prices trade between 0 and 1 (often shown as 0 percent to 100 percent). A share priced at 0.62, for example, reflects a crowd estimate of roughly a 62 percent chance. Prices move continuously as traders buy and sell, and the cost of a winning bet rises as confidence in that outcome grows.\n\nWhen an event concludes, the market must be resolved. Polymarket uses a decentralized oracle system (UMA\'s Optimistic Oracle), in which a proposed outcome can be challenged during a dispute window before payouts are finalized. This community-driven settlement has at times drawn scrutiny over contested resolutions.',
      },
      {
        heading: 'What you can trade on',
        body: "Polymarket's breadth is one of its defining features. Politics has historically driven its biggest volumes — presidential and congressional races, leadership contests, and policy votes — but the catalog extends well beyond elections.\n\nCommon categories include cryptocurrency prices (such as whether Bitcoin will close above a level by a date), macroeconomics (central-bank rate decisions, inflation prints), sports outcomes, and a rotating set of current-events questions on geopolitics, technology, business, and culture. Because new markets are created around whatever is in the news, the available questions shift constantly.\n\nFor fast-moving specifics — which candidate is favored, or what price a market implies today — it is better to read the live market page directly than to rely on any fixed figure, since these numbers can change by the hour.",
      },
      {
        heading: 'US regulatory and availability status',
        body: "Polymarket's relationship with US regulation has changed significantly over time, and the details matter for who can legally use it.\n\nIn January 2022, the US Commodity Futures Trading Commission (CFTC) settled with Polymarket (then operating as Blockratize) over running an unregistered swaps facility, resulting in a 1.4 million dollar penalty. The platform subsequently restricted access for US-based traders for several years.\n\nThe picture shifted in 2025. US authorities closed their investigations, and Polymarket acquired a CFTC-licensed derivatives exchange and clearinghouse (the QCX/QCEX entities) for about 112 million dollars, giving it licensed infrastructure to operate domestically. After the CFTC cleared its new exchange, Polymarket received an amended order of designation in late 2025 and began bringing US users back, initially through an invite-only, waitlisted rollout rather than a full public launch. Availability, eligibility, and account requirements continue to evolve, so prospective users should confirm current rules on Polymarket's own site.",
      },
      {
        heading: 'Its growing role in news',
        body: 'Beyond trading, Polymarket has become a reference point in journalism. During the 2024 US presidential race, billions of dollars in contracts traded on the outcome, and reporters increasingly cited market-implied odds alongside polls as a real-time gauge of expectations.\n\nThis is the lens Crowdtells uses: prediction-market prices can surface which stories the public is watching most closely and how confidence is shifting. They are a useful signal, not a verdict. Markets can be moved by a few large traders, can misprice unlikely events, and reflect beliefs rather than facts. Read them as one probability-based input among many, and pair them with reporting before drawing conclusions.',
      },
    ],
    faq: [
      {
        q: 'Is Polymarket legal in the US?',
        a: "It depends on timing and your location. Polymarket restricted US access after a 2022 CFTC settlement, but in 2025 it acquired a CFTC-licensed exchange and received an amended designation to offer markets to US users, beginning an invite-only rollout in late 2025. Eligibility and requirements can change, so confirm current status directly on Polymarket's site.",
      },
      {
        q: 'Who founded Polymarket and when?',
        a: 'Polymarket was founded in June 2020 by Shayne Coplan, an entrepreneur who started the company in his early twenties. It is headquartered in New York City and has grown into one of the largest prediction markets by trading volume, backed by prominent technology investors over multiple funding rounds.',
      },
      {
        q: 'How does Polymarket make money for traders?',
        a: 'Traders buy Yes or No shares priced between 0 and 1 dollar. If your side is correct when the event resolves, each share pays 1 dollar; if it is wrong, it pays nothing. Profit comes from buying shares for less than their eventual payout, but losses are equally possible. This is speculation, not advice.',
      },
      {
        q: 'What currency does Polymarket use?',
        a: 'Polymarket operates on cryptocurrency rails. Traders deposit and settle in USDC, a stablecoin pegged to the US dollar, and transactions are recorded on the Polygon blockchain. Using a dollar-linked stablecoin keeps prices intuitive — a share at 0.62 reflects roughly a 62 percent implied probability.',
      },
      {
        q: 'Are Polymarket odds accurate predictions?',
        a: "Prediction-market prices are probability estimates, not guarantees. They aggregate many traders' expectations and can update quickly, which often makes them informative. But they can be skewed by large individual bets, misprice rare events, and reflect belief rather than fact. Treat them as one signal to weigh alongside reporting, not as advice.",
      },
    ],
    relatedTopics: ['Politics', 'Crypto', 'Economics', 'Finance', 'Sports', 'Geopolitics'],
  },
  {
    slug: 'what-is-kalshi',
    title: 'What Is Kalshi? The Regulated Event-Contract Exchange',
    h1: 'What Is Kalshi?',
    metaDescription:
      'Kalshi is a US, CFTC-regulated event-contracts exchange. Learn what it is, how it works, what you can trade, and how it differs from Polymarket.',
    intro:
      'Kalshi is a United States exchange where people trade contracts on the outcome of real-world events, from interest-rate decisions to weather to award shows. It is regulated by the Commodity Futures Trading Commission (CFTC) as a designated contract market (DCM) — the same federal category as established futures venues like the CME. Prices on Kalshi function as crowd-sourced probabilities, not guarantees or financial advice. This page explains what Kalshi is, how it works, and how it differs from Polymarket.',
    sections: [
      {
        heading: 'What Kalshi is and how it is regulated',
        body: "Kalshi is an event-contracts exchange: a marketplace for binary contracts tied to whether a specific event will or will not happen. It operates as a designated contract market (DCM), a federally regulated exchange status overseen by the CFTC, the same agency that regulates US commodity-futures markets.\n\nKalshi's operating entity, KalshiEX LLC, received CFTC designation in November 2020, making it the first exchange approved to list event contracts directly to US retail traders. Its regulatory standing has been contested in court: in September 2024, a federal district court ruled in Kalshi's favor against the CFTC over certain election-related contracts, and the CFTC later dropped its appeal in 2025. Separate disputes with state regulators remain ongoing, so the legal picture continues to evolve.\n\nA DCM is a self-regulatory exchange that must follow CFTC rules on market integrity, reporting, and consumer protection. That structure is the core of what distinguishes Kalshi from offshore or crypto-native venues.",
      },
      {
        heading: 'How trading on Kalshi works',
        body: 'Each market poses a yes-or-no question with a defined resolution date and source. Traders buy "Yes" or "No" contracts. Each contract settles at $1 if its side is correct and $0 if it is wrong, so prices trade between $0.01 and $0.99.\n\nThe price is the key concept: a "Yes" contract priced at $0.70 reflects a market-implied probability of roughly 70% that the event happens. Prices move with supply and demand as traders buy and sell, so they update continuously. Reading a Kalshi price means reading it as a probability, not a prediction that is certain to come true.\n\nKalshi charges trading fees that vary by market and order type, plus possible processing fees on some deposit and withdrawal methods. Fee schedules change over time, so check Kalshi\'s current fee page rather than relying on a fixed figure. Importantly, traders can only lose the money they have committed to a position — there is no margin debt to the exchange on event contracts.',
      },
      {
        heading: 'What you can trade on Kalshi',
        body: 'Kalshi lists contracts across a wide range of categories rather than a single subject. Common themes include economics and finance (for example, Federal Reserve rate decisions or ranges for the S&P 500), climate and weather (such as the high temperature in a given city on a date), politics and policy, and cultural events like awards outcomes.\n\nThe set of available markets changes constantly as old contracts resolve and new ones open. Some categories have drawn regulatory and legal scrutiny — sports-related event contracts, in particular, have been the subject of ongoing disputes over whether they resemble sports betting, with courts and state regulators reaching differing conclusions. Because the listed catalog and its legal boundaries shift, treat any specific market list as a snapshot and verify what is currently offered on the exchange itself.',
      },
      {
        heading: 'Kalshi vs. Polymarket: the key differences',
        body: "Kalshi and Polymarket are the two most prominent prediction-market platforms, but they are built differently.\n\nRegulation: Kalshi has held a CFTC DCM license since 2020. Polymarket originated as an offshore, blockchain-based platform and in 2022 settled with the CFTC over offering unregistered event contracts to US persons, paying a fine and blocking US users at the time. Polymarket later acquired a CFTC-licensed exchange (QCX) in 2025 to build a regulated US pathway.\n\nCurrency and funding: Kalshi is denominated in US dollars and funds via methods such as bank transfer, wire, and debit card; it also supports stablecoin (USDC) deposits, which are credited as USD balances. Polymarket is crypto-native, settling trades in the USDC stablecoin and requiring a connected wallet.\n\nUS availability: Kalshi operates under its federal DCM license, but real-money access can vary by state amid ongoing legal disputes, and Polymarket's US real-money access is newer. Check each platform's current state-by-state status before assuming access.\n\nFor a neutral reader, the practical takeaway is that Kalshi is the longer-standing US-regulated, dollar-denominated option, while Polymarket is crypto-based with a more recently built US compliance layer.",
      },
      {
        heading: 'Founding and history',
        body: 'Kalshi was founded in 2018 by Tarek Mansour and Luana Lopes Lara, who met as students at the Massachusetts Institute of Technology. Their premise was that people lacked a clean, regulated way to take positions on, or hedge against, real-world uncertainties.\n\nRather than launch quickly offshore, the founders pursued formal CFTC approval. After a multi-year process, KalshiEX LLC received its DCM designation in November 2020 and launched publicly in 2021. The platform has since expanded its market categories and trading activity substantially, becoming one of the most prominent venues in tracked US prediction-market volume.\n\nAs always with prediction markets, the prices Kalshi displays are probabilistic signals shaped by trader behavior — useful for gauging expectations, but not financial advice and not a guarantee of any outcome.',
      },
    ],
    faq: [
      {
        q: 'Is Kalshi legal in the US?',
        a: 'Kalshi operates as a CFTC-regulated designated contract market (DCM), a federal exchange status it has held since November 2020. Its standing has been upheld in federal court against the CFTC over certain contracts. However, some categories, especially sports-related markets, have faced separate legal challenges from state regulators, and real-money availability can vary by state as those disputes continue.',
      },
      {
        q: 'What is the difference between Kalshi and Polymarket?',
        a: 'Kalshi is a US, CFTC-regulated exchange that is denominated in US dollars. Polymarket began as an offshore, blockchain-based platform settling in the USDC stablecoin; it settled with the CFTC in 2022 over unregistered US event contracts and later built a US regulatory pathway by acquiring a CFTC-licensed exchange in 2025. Kalshi is the longer-standing US-regulated, dollar-based option.',
      },
      {
        q: 'How do prices work on Kalshi?',
        a: 'Each market has Yes and No contracts that settle at $1 if correct and $0 if wrong, so prices range from $0.01 to $0.99. The price reflects the market-implied probability of the event: a contract at $0.65 implies about a 65% chance. Prices move with supply and demand and should be read as probabilities, not certainties or advice.',
      },
      {
        q: 'Who founded Kalshi and when?',
        a: 'Kalshi was founded in 2018 by Tarek Mansour and Luana Lopes Lara, who met while studying at MIT. They pursued formal CFTC approval rather than launching offshore, and the operating entity KalshiEX LLC received designated contract market status in November 2020, launching its platform publicly in 2021.',
      },
      {
        q: 'What can you trade on Kalshi?',
        a: "Kalshi lists yes-or-no event contracts across many categories, including economics and finance such as Federal Reserve rate decisions, climate and weather like a city's daily high temperature, politics and policy, and cultural events such as award outcomes. The available markets change constantly as contracts resolve and new ones open, so check the current catalog on the exchange.",
      },
    ],
    relatedTopics: ['Economics', 'Finance', 'Politics', 'Crypto', 'Climate and Weather'],
  },
  {
    slug: 'are-prediction-markets-accurate',
    title: 'Are Prediction Markets Accurate? Evidence and Findings',
    h1: 'Are Prediction Markets Accurate? What the Evidence Shows',
    metaDescription:
      'A balanced, sourced look at prediction market accuracy: academic calibration findings, where markets beat polls, and where they fail on thin markets and bias.',
    intro:
      'Prediction markets, where people trade contracts that pay out based on whether an event happens, are often accurate but not infallible. Decades of research show market prices are frequently well calibrated and tend to match or beat polls and expert forecasts, especially over longer horizons. But accuracy degrades in thin markets, around genuine surprises, and where bias or manipulation creeps in. Prices are probability estimates, not guarantees.',
    sections: [
      {
        heading: 'What "accurate" actually means here',
        body: 'A prediction market price is read as a probability. A contract trading at 70 cents implies roughly a 70 percent chance the event happens. Accuracy is not whether the favorite won a single time; it is whether those probabilities hold up across many events.\n\nResearchers measure this with calibration and scoring rules. Calibration asks: of all the things priced near 70 percent, did about 70 percent actually occur? Two common scores, the Brier score and log-loss, reward forecasts that are both correct and appropriately confident, and they punish predictions that are confidently wrong. These are the same metrics used to grade weather forecasts and poll-based models, which makes cross-comparison meaningful.\n\nThe key takeaway: well-calibrated does not mean always right. A good market should be wrong about 30 percent of the time on its 70-cent contracts. Being surprised occasionally is expected, not a failure.',
      },
      {
        heading: 'The academic case that markets work',
        body: "The foundational survey by economists Justin Wolfers and Eric Zitzewitz (published in the Journal of Economic Perspectives in 2004, with later follow-up work) argued that market-generated forecasts typically outperform moderately sophisticated benchmarks across elections, sports, and business outcomes. Their theoretical work showed that, under reasonable assumptions, prices reflect a wealth-weighted average of traders' beliefs, which is part of why prices can be treated as probabilities.\n\nThe longest-running evidence comes from the Iowa Electronic Markets, a small not-for-profit academic exchange run by the University of Iowa since 1988 under a no-action letter from the Commodity Futures Trading Commission. In a study by Berg and colleagues comparing the market against 964 polls across five US presidential elections from 1988 to 2004, the market was closer to the final result about 74 percent of the time, with the edge growing at longer forecasting horizons where polls are noisiest. This is the recurring basis for the claim that markets beat polls.",
      },
      {
        heading: 'Where markets beat polls',
        body: 'Markets have structural advantages over polls in specific situations. They aggregate continuously rather than as snapshots, so they update the instant news breaks instead of waiting for the next survey. They put money behind opinions, which can discourage cheap talk and reward people who do real homework. And they fold in factors a single poll cannot, such as turnout, momentum, and how separate events interact.\n\nThe edge is largest when polls are weakest: far ahead of an event, on questions with no good polling at all (a CEO departure, a court ruling, a product launch date), and where many information sources must be combined. Internal corporate markets at firms like Google have produced useful forecasts that would be hard to obtain any other way, though research on those markets also documented identifiable biases.',
      },
      {
        heading: 'Where markets fail',
        body: 'Accuracy is conditional, and several well-documented failure modes recur.\n\nThin markets: With few traders and little money at stake, a single participant can move the price, and the signal becomes noise. Niche or obscure contracts are the least reliable.\n\nFavorite-longshot bias: Across betting and prediction markets, traders tend to overpay for unlikely "longshot" outcomes and slightly underprice heavy favorites. This means very low and very high probabilities are often the least trustworthy zone.\n\nSurprises and tail events: Markets, like people, are poorly calibrated on rare events. A genuine shock the crowd did not see coming will be mispriced, by definition, until news arrives.\n\nManipulation and whales: Large traders can distort prices. In the 2024 US election, a French trader known as "Théo" placed over $28 million on a Trump win on Polymarket, using several accounts, and reportedly made tens of millions; while he was correct, the episode showed how a single actor can dominate a market and fueled questions about whether prices reflect crowds or capital.',
      },
      {
        heading: 'The Vanderbilt comparison: bigger is not more accurate',
        body: "A study from Vanderbilt University by Joshua Clinton and TzuFeng Huang examined roughly 2,500 political markets and about $2.5 billion in volume across Polymarket, Kalshi, and PredictIt during the final five weeks before the 2024 US election.\n\nMeasured with log-loss and Brier scores, the platforms diverged sharply: the researchers reported PredictIt as the most accurate at about 93 percent, Kalshi at about 78 percent, and Polymarket, by far the largest, the least accurate at about 67 percent. They found that many of Polymarket's national markets showed negative serial correlation, a fingerprint of overreaction and noise trading rather than steady, informed updating, and noted cases where mutually exclusive outcomes moved in the same direction.\n\nThe lesson runs against intuition: PredictIt's small, capped-stake design (an $850 per-contract limit during the 2024 cycle, since raised) appeared to produce calmer, more accurate prices than Polymarket's far larger stakes. Liquidity and volume alone do not guarantee accuracy. These are single-cycle findings on one election, so they should be read as evidence, not a final verdict.",
      },
      {
        heading: 'How to read a prediction market sensibly',
        body: 'Treat a price as a probability with error bars, not a prophecy. A 65 percent contract means the other outcome is a realistic one-in-three event.\n\nCheck the depth before trusting the number. High volume and many distinct traders make a price more credible; a thin, low-volume market can be moved by one person. Be most skeptical at the extremes, where favorite-longshot bias and poor tail calibration tend to bite hardest. Watch for sudden moves with no news, which can signal a large trader rather than new information. And compare across venues and against polls or models: when independent sources agree, confidence is warranted; when they diverge, that disagreement is itself information.\n\nCrowdtells reads markets this way, as one signal among several, never as advice.',
      },
    ],
    faq: [
      {
        q: 'Are prediction markets more accurate than polls?',
        a: 'Often, yes, especially well before an event and where polling is sparse. A study across five US presidential elections from 1988 to 2004 found the Iowa Electronic Markets beat 964 polls about 74 percent of the time, with the largest edge at longer horizons. But markets are not always better, and accuracy depends on liquidity and the type of question.',
      },
      {
        q: 'Which prediction market is most accurate, Polymarket or Kalshi?',
        a: 'It varies. A Vanderbilt study of the final five weeks of the 2024 US election found PredictIt most accurate (about 93 percent), then Kalshi (about 78 percent), with Polymarket least accurate (about 67 percent) despite being the largest. That is one cycle of evidence, so treat it as a data point, not a permanent ranking.',
      },
      {
        q: 'Does higher trading volume mean more accurate prices?',
        a: 'Not necessarily. The Vanderbilt 2024 study found Polymarket, the highest-volume platform, was the least accurate, while smaller capped-stake PredictIt was the most accurate. Volume helps prevent a single trader from dominating, but design, trader incentives, and noise trading also shape accuracy. Liquidity alone does not guarantee a reliable price.',
      },
      {
        q: 'What is the favorite-longshot bias?',
        a: 'It is the documented tendency for traders to overprice unlikely "longshot" outcomes and slightly underprice heavy favorites. Seen across betting and prediction markets, it means probabilities near the extremes, very low or very high, are often the least trustworthy. It can stem from risk-seeking behavior or limited arbitrage capital correcting the mispricing.',
      },
      {
        q: 'Can prediction markets be manipulated?',
        a: 'Yes, particularly thin markets or platforms with high stake limits, where a large trader can move the price on their own. During the 2024 US election a trader known as Théo placed over $28 million on a Trump win on Polymarket. Cross-checking against polls, models, and other venues helps spot prices driven by capital rather than information.',
      },
    ],
    relatedTopics: ['Politics', 'World Elections', 'Economics', 'Finance'],
  },
  {
    slug: 'kalshi-vs-polymarket',
    title: 'Kalshi vs Polymarket: A Fair Comparison',
    h1: 'Kalshi vs Polymarket: How the Two Prediction Markets Compare',
    metaDescription:
      'Kalshi vs Polymarket compared on regulation, currency, US access, market breadth, fees, liquidity, and accuracy — and when each platform is more useful.',
    intro:
      "Kalshi and Polymarket are two of the largest prediction markets, where people trade contracts that pay out based on whether a future event happens. The clearest difference is structure: Kalshi was built from the start as a U.S. exchange regulated by the Commodity Futures Trading Commission (CFTC) and settled in dollars, while Polymarket grew up as a crypto-native platform settled in USDC, a dollar-pegged stablecoin. By 2026 both offer regulated U.S. access, but they reach it from opposite directions. A prediction-market price reflects the crowd's estimated probability of an outcome — it is information, not financial advice.",
    sections: [
      {
        heading: 'Regulation and corporate structure',
        body: 'Kalshi was founded in 2018 by Tarek Mansour and Luana Lopes Lara, two MIT graduates, and received CFTC approval in November 2020 to operate as a Designated Contract Market — making it widely regarded as the first fully regulated U.S. exchange dedicated to event contracts. It launched to the public in July 2021 and operates directly under CFTC oversight, more like a regulated derivatives venue than a betting site.\n\nPolymarket, founded in 2020 by Shayne Coplan, took a different path. It began as a crypto-native platform and, in January 2022, settled CFTC charges for offering markets without registering, paying a civil penalty and winding down access for U.S. users. After federal investigations were closed in 2025, Polymarket acquired QCEX — a CFTC-licensed derivatives exchange and clearinghouse — and moved to re-enter the United States through a regulated structure. The result is effectively a dual setup: a large global exchange plus a CFTC-regulated U.S. arm.',
      },
      {
        heading: 'Currency: dollars vs. stablecoin',
        body: 'Kalshi works entirely in U.S. dollars. You fund an account by bank transfer, debit card, or similar methods, and contracts are priced and settled in dollars — no crypto involved.\n\nPolymarket settles in USDC, a stablecoin pegged to the U.S. dollar, and has historically run on Polygon, a low-cost blockchain network. In practice one USDC tracks one dollar, but the crypto rails mean there can be on-ramp steps, wallet considerations, and network mechanics that a purely dollar-based account avoids. For users comfortable with crypto, USDC can mean fast, low-cost movement of funds; for those who are not, it is added friction.',
      },
      {
        heading: 'US availability',
        body: 'Both platforms are now accessible to eligible U.S. users, but the histories differ. Kalshi has been available to Americans since its 2021 launch, with state-level availability varying for certain market types over time. Polymarket was closed to U.S. residents from 2022 until its regulated return in 2025.\n\nBecause rules and state-by-state availability shift — particularly for sports-related contracts, which have drawn ongoing regulatory attention — confirm current access and eligibility directly on each platform rather than relying on a fixed snapshot. In 2026 the CFTC issued a proposed rulemaking on event contracts that, if finalized, could reshape which contracts are permitted — including which sports markets are allowed — so the regulatory picture remains in motion.',
      },
      {
        heading: 'Market breadth, fees, and liquidity',
        body: "Polymarket is known for wide-ranging, fast-moving markets spanning politics, crypto, world events, culture, and economics, and it has historically carried deep liquidity on headline questions. Kalshi offers a structured catalog across economics, politics, weather, financials, and more, with the assurance of operating inside a regulated exchange framework.\n\nFee structures differ and change frequently. Kalshi has typically used a per-contract trading fee that scales with price, plus possible deposit costs on certain methods. Polymarket long marketed minimal trading fees on its global platform but introduced category-based taker fees in 2026, with limit-order 'makers' often paying less or nothing and, in some cases, receiving rebates. Because both have revised pricing recently, check each platform's current fee schedule before comparing real costs. For liquidity, look at the order book depth and bid-ask spread on the specific market you care about — a thin market moves more on small trades regardless of platform.",
      },
      {
        heading: 'Accuracy and how to read the odds',
        body: 'Prediction markets are often accurate because traders risk their own money on their beliefs, which tends to surface well-calibrated probabilities — but accuracy varies by market. High-volume, widely followed questions usually price more reliably than obscure or thinly traded ones, where a few participants can swing the odds.\n\nRead a price as a probability: a contract trading at 65 cents implies roughly a 65 percent chance the market assigns to that outcome. Compare the same question across both platforms when you can; large gaps can reflect different user bases, liquidity, or resolution wording. Always check how a market resolves — the exact criteria and source — because two similar-sounding contracts can settle on different definitions.',
      },
      {
        heading: 'When each is more useful',
        body: "Kalshi tends to suit users who want a dollar-denominated account with no crypto, value operating inside a CFTC-regulated U.S. exchange, and follow economic, financial, and event-driven questions. Its structure appeals to people who treat event contracts like a regulated financial instrument.\n\nPolymarket tends to suit users comfortable with stablecoins who want broad, fast-moving global markets and deep liquidity on major news, politics, and crypto questions. For reading the crowd's probability on a breaking story, its breadth and volume are a strength. Many people consult both: cross-checking the same question on each platform gives a fuller read on where the market consensus actually sits.",
      },
    ],
    faq: [
      {
        q: 'Is Kalshi or Polymarket legal in the US?',
        a: 'Both offer regulated U.S. access as of 2026. Kalshi has operated as a CFTC-regulated Designated Contract Market since 2021. Polymarket returned to U.S. users in 2025 through a CFTC-licensed structure after acquiring the QCEX exchange and clearinghouse. Availability for specific market types can vary by state and is evolving, so confirm current eligibility on each platform.',
      },
      {
        q: 'What is the main difference between Kalshi and Polymarket?',
        a: 'Kalshi is a U.S. exchange regulated by the CFTC that trades in dollars, built that way from the start. Polymarket began as a crypto-native platform that settles in USDC, a dollar-pegged stablecoin, and later added a regulated U.S. arm. The core split is dollars and direct regulation versus stablecoin rails and crypto origins.',
      },
      {
        q: 'Does Polymarket use real money or crypto?',
        a: 'Polymarket settles in USDC, a stablecoin pegged one-to-one to the U.S. dollar, historically on the Polygon network. So positions are effectively dollar-denominated, but funding and withdrawals run through crypto rails. Kalshi, by contrast, uses U.S. dollars directly with bank and card funding, no crypto involved.',
      },
      {
        q: 'Which prediction market is more accurate?',
        a: "Neither is reliably more accurate across the board. Accuracy depends on the specific market: high-volume, widely traded questions tend to price probabilities well on both platforms, while thin markets are noisier. A good practice is comparing the same question on both and checking each market's exact resolution criteria before drawing conclusions.",
      },
      {
        q: 'Are Kalshi and Polymarket fees the same?',
        a: "No, and both revised pricing recently. Kalshi generally uses a per-contract fee that scales with price. Polymarket marketed minimal fees on its global platform but added category-based taker fees in 2026, with limit-order makers often paying less or earning rebates. Because schedules change, check each platform's current fees for the markets you trade.",
      },
    ],
    relatedTopics: ['Politics', 'Economics', 'Crypto', 'Finance', 'Sports', 'Geopolitics'],
  },
  {
    slug: 'how-to-read-prediction-market-odds',
    title: 'How to Read Prediction-Market Odds',
    h1: 'How to Read Prediction-Market Odds',
    metaDescription:
      'A practical guide to reading prediction-market odds: price as implied probability, what moves and volume mean, and common misreadings to avoid.',
    intro:
      'On a prediction market, the price of a contract is the market\'s estimate of how likely an event is. A "Yes" share trading at 63 cents means traders, collectively, are pricing the outcome at roughly a 63% chance. This guide explains how to convert price into probability, how to read a move, what volume and liquidity tell you, what a gap between Polymarket and Kalshi means, and the mistakes that lead people to misread the number. Prediction-market prices are crowd-sourced probability estimates, not guarantees or advice.',
    sections: [
      {
        heading: 'Price is implied probability',
        body: 'Prediction-market contracts settle at either $1 (the event happened) or $0 (it did not). Because of that, the current price reads directly as a probability. A contract at $0.70 implies about a 70% chance; one at $0.25 implies about 25%. The formula is simply price multiplied by 100.\n\nYes and No prices are complementary and add up to roughly $1. If Yes trades at $0.63, No trades near $0.37. In practice they sum to slightly more than $1 because of the bid-ask spread, the gap between the best buying and selling price. Unlike a sportsbook, which builds a house margin into its odds, an exchange-style prediction market sets price through supply and demand among traders, so one number maps to one probability without bookmaker math.',
      },
      {
        heading: 'Reading a move or a swing',
        body: "A price change is a change in the crowd's probability estimate, usually triggered by new information: a poll, an earnings report, a court ruling, a candidate dropping out. A contract jumping from $0.40 to $0.70 means the implied chance rose from 40% to 70%.\n\nAsk two questions about any swing. First, did real news arrive, or did one large order push a thin market around? Second, did the move hold or snap back? A durable repricing after a clear event is more meaningful than a spike that reverts within minutes. Watch the size of the move relative to the contract's normal daily range, and check whether other related markets moved in the same direction.",
      },
      {
        heading: 'Volume, liquidity and open interest',
        body: 'These three numbers tell you how much to trust the price. Volume is how much has traded over a period; it shows current activity and whether a price move attracted new participants. Open interest is the total number of contracts still outstanding and not yet settled, a gauge of how much money is committed to the market overall.\n\nLiquidity is the depth of resting buy and sell orders. High liquidity means tight spreads and prices that hold up; low liquidity means wide spreads and prices that can lurch on a single order. A market with heavy volume and deep order books is a more reliable probability reading than a thin one that may sit untraded for hours. Treat prices on low-volume, low-open-interest contracts with caution: they move erratically and are easier to push.',
      },
      {
        heading: 'What a Polymarket-Kalshi gap means',
        body: 'Polymarket and Kalshi are two of the largest venues, and they often list the same event. Polymarket, founded in 2020 by Shayne Coplan, settles in the stablecoin USDC; in November 2025 it secured CFTC clearance to operate as a regulated U.S. exchange with intermediated access. Kalshi, founded in 2018 by Tarek Mansour and Luana Lopes Lara, launched in 2021 as a CFTC-regulated U.S. exchange and settles in dollars.\n\nWhen the same outcome is priced differently across the two, the gap reflects different trader pools, fees, and liquidity rather than a guaranteed mispricing. Small gaps are normal. A persistent, large gap is worth noting: it usually means one venue is thinner or its contract is worded slightly differently. Always compare the exact resolution criteria before assuming two markets are measuring the same thing.',
      },
      {
        heading: 'Common misreadings',
        body: 'Treating a probability as a prediction. A 75% market still resolves No one time in four; that is not a market being wrong, it is the lower-probability outcome occurring as expected over many events.\n\nTrusting extremes too much. Research commonly finds a favorite-longshot bias: very unlikely outcomes tend to be overpriced and strong favorites slightly underpriced, with prices near 0% and 100% often the least reliable. Markets tend to be best calibrated in the rough 20%-to-80% range.\n\nReading a thin market as consensus. A price set by little money is not the wisdom of a crowd. Other traps: ignoring fees that erode the implied edge, and confusing a stale last-trade price with the live mid-market price.',
      },
    ],
    faq: [
      {
        q: 'What does a 70% prediction market price mean?',
        a: 'It means the market estimates about a 70% chance the event resolves Yes. The contract pays $1 if it happens and $0 if it does not, so a $0.70 price reads directly as 70% implied probability. It is a crowd estimate, not a guarantee: roughly three times in ten, a 70% market still resolves No.',
      },
      {
        q: 'Why do Polymarket and Kalshi show different odds?',
        a: 'They have separate trader pools, fees, settlement currencies, and liquidity, so the same event can price slightly differently. Small gaps are routine. A large, persistent gap usually signals that one venue is thinner or that the two contracts have subtly different resolution rules. Compare the exact wording before assuming a true mispricing exists.',
      },
      {
        q: 'What is the difference between volume and open interest?',
        a: 'Volume is how many contracts traded over a period and reflects current activity. Open interest is the total number of contracts still outstanding and unsettled, reflecting how much money is committed overall. High volume signals an active price; high open interest signals a deep, established market. Together they indicate how reliable a price is.',
      },
      {
        q: 'Are prediction market odds accurate?',
        a: 'Studies generally find prediction markets are well calibrated, especially for outcomes in the roughly 20%-to-80% range, where prices tend to track real frequencies closely. Accuracy often degrades at the extremes due to favorite-longshot bias, where very unlikely events tend to be overpriced. Thinly traded markets are far less reliable than liquid ones.',
      },
      {
        q: 'How do I read a sudden swing in the odds?',
        a: "A swing is a change in the crowd's probability estimate, usually from new information like a poll or ruling. Check whether genuine news drove it or a single large order pushed a thin market, and whether the move held or reverted. Durable repricing after a clear event is more meaningful than a brief spike.",
      },
    ],
    relatedTopics: ['Politics', 'Economics', 'Finance', 'Crypto', 'Geopolitics'],
  },
  {
    slug: 'prediction-markets-vs-polls',
    title: 'Prediction Markets vs Polls: What Each Measures',
    h1: 'Prediction Markets vs. Polls: How They Differ and How to Read Both',
    metaDescription:
      'Prediction markets vs polls: what each actually measures, where each is strong or weak, why markets move faster, why polls can be more representative, and how to use both.',
    intro:
      'Polls and prediction markets answer two different questions. A poll measures what a sample of people say they intend to do; a prediction market measures the price traders are willing to pay on an outcome, which behaves like a probability. Neither is a forecast you should trust blindly. The most useful approach is to read them side by side, knowing what each one can and cannot tell you.',
    sections: [
      {
        heading: 'What a poll measures',
        body: 'A poll surveys a sample of people and reports their stated intentions or opinions at a moment in time. Pollsters try to draw a representative sample, meaning one in which every part of the target population has a chance of being included, then weight the results so the sample resembles the wider group.\n\nThe headline number always carries a margin of error, the range within which the true population value likely sits. Larger samples shrink that range: a sample of roughly 1,000 people typically yields a margin of about plus or minus 3 percentage points, while smaller samples are wider. A margin of error only captures random sampling error. It does not capture other problems, such as who refuses to respond, how questions are worded, or whether the people sampled actually turn out. When a race is inside the margin of error, the poll is genuinely saying the result is too close to call.',
      },
      {
        heading: 'What a prediction market measures',
        body: "A prediction market lets people trade contracts that pay out if an event happens. A contract on an outcome trades between 0 and 100 cents (or 0 to 100 percent), and that price is read as the market's implied probability. If a contract trades at 60 cents, the market is collectively pricing the outcome at roughly 60 percent.\n\nCrucially, this is a price, not a survey. It reflects what traders with money at stake believe, aggregating news, polls, models, and private information into a single number. The Iowa Electronic Markets, run by the University of Iowa since 1988, are the longest-running formal example and were built specifically to test whether a market could beat polls. Newer venues include Kalshi, which won approval from the U.S. Commodity Futures Trading Commission (CFTC) to operate a regulated exchange and launched public trading in 2021, and Polymarket, a crypto-based platform launched in 2020. Because they trade continuously, market prices update in real time.",
      },
      {
        heading: 'Why markets can react faster',
        body: 'Polls are snapshots. Fielding, weighting, and publishing a survey takes days, so a poll always describes the recent past. A prediction market reprices the instant new information appears, because traders can act immediately and stand to profit by being early. That makes markets useful for tracking how sentiment shifts around debates, scandals, economic data, or breaking news, well before the next poll lands.\n\nSpeed is also a weakness. A price can swing on thin trading, rumor, or a single large trade, so a sharp move may reflect noise rather than real information. Liquidity, the volume of active trading, matters: a heavily traded market is harder to push around than a quiet one.',
      },
      {
        heading: 'Why polls can be more representative',
        body: 'A market price reflects only the people who trade, and traders are not a cross-section of the electorate. They skew toward those with money, market access, and strong views, and they can carry partisan bias. A well-constructed poll deliberately reaches a representative sample, which is exactly what a market does not do.\n\nThis is why the two tools measure different things. A poll estimates how a population leans; a market estimates the probability of an outcome. A market can be confident and a poll can be close at the same time without either being wrong, because they are not answering the same question.',
      },
      {
        heading: 'What recent election cycles showed',
        body: 'The 2024 U.S. presidential election is often cited as a win for markets: on the eve of the vote, major prediction markets priced Donald Trump well above 50 percent while polling averages showed a near tie, and Trump won. But this is a single data point, and accuracy varied widely across platforms in that cycle.\n\nResearch on the longer record is more measured. Studies of the Iowa Electronic Markets across decades of elections found market prices beat the poll closer to the outcome in a majority of comparisons, with the largest edge far in advance of election day. Markets have also missed outcomes that polls called correctly. The honest summary is that markets and polls each win some and lose some, and no single cycle settles the question.',
      },
      {
        heading: 'How to use them together',
        body: 'Treat polls and markets as complementary instruments. Use polls to understand the structure of opinion: who supports what, by how much, and within what margin of error. Use markets to gauge the implied probability of a final outcome and to see how fast sentiment is moving between polls.\n\nWhen they disagree, that gap is information, not an error. Ask why: is the market reacting to news the latest poll predates, or is it thinly traded and skewed? Read prices as probabilities, weigh how much money and volume stand behind them, and remember that a 70 percent contract still loses about three times in ten. Both are signals of what people think will happen, not statements of what will. None of this is financial advice; trading on these markets carries real risk of loss.',
      },
    ],
    faq: [
      {
        q: 'Are prediction markets more accurate than polls?',
        a: 'Sometimes, but not reliably. Studies of the long-running Iowa Electronic Markets found prices beat polls in a majority of historical comparisons, especially far ahead of election day. Markets priced the 2024 U.S. presidential result better than polling averages, but that is one cycle, and accuracy varied across platforms. Neither tool is consistently superior; they measure different things.',
      },
      {
        q: 'What does a prediction market price actually mean?',
        a: 'A contract trades between 0 and 100 cents and pays out if the event happens, so its price reads as an implied probability. A contract at 65 cents means the market collectively prices that outcome at about 65 percent. It reflects the views of traders risking money, not a survey of the public, and it updates continuously as new information arrives.',
      },
      {
        q: 'Why do prediction markets and polls sometimes disagree?',
        a: 'They answer different questions. A poll measures stated opinion in a representative sample at one moment, with a margin of error. A market prices the probability of a final outcome and updates in real time. A market can react to news a poll predates, or move on thin trading. Disagreement is a signal to investigate, not proof either is wrong.',
      },
      {
        q: 'What is the margin of error in a poll?',
        a: "The margin of error is the range within which a poll's true population value likely falls, accounting only for random sampling. A sample of about 1,000 people typically gives roughly plus or minus 3 percentage points. It does not capture non-response, question wording, or turnout error. When a race sits inside the margin, the poll is effectively calling it too close to predict.",
      },
      {
        q: 'Are prediction markets legal and regulated?',
        a: 'Some are. Kalshi operates as a CFTC-regulated exchange and launched trading in 2021. Polymarket launched in 2020 and was fined $1.4 million by the CFTC in 2022 for operating unregistered swaps in the U.S.; in 2025 it gained a regulated U.S. foothold by acquiring a CFTC-licensed exchange. The Iowa Electronic Markets run under academic no-action relief. Regulatory status varies by platform and changes over time.',
      },
    ],
    relatedTopics: ['Politics', 'World Elections', 'Economics', 'Finance'],
  },
  {
    slug: 'prediction-markets-vs-sportsbooks',
    title: 'Prediction Markets vs. Sportsbooks Explained',
    h1: 'Prediction Markets vs. Sportsbooks: How Each One Sets a Price',
    metaDescription:
      'Prediction markets and sportsbooks both quote odds on outcomes, but they price, profit, and are regulated differently. A plain-English explainer of how each works.',
    intro:
      'A prediction market and a sportsbook can both quote you a number on the same game or election, yet they are built on opposite business models. A sportsbook is a bookmaker that takes the other side of your wager and bakes a margin into the odds; a prediction market is a peer-to-peer exchange where traders buy and sell contracts from each other and the platform charges a fee. That difference shapes the price you see, who profits, and which regulator is in charge. This page explains both, with no betting advice.',
    sections: [
      {
        heading: 'Two different machines for the same question',
        body: "A sportsbook works like a house. Oddsmakers and quantitative teams post an opening line based on data and models, then move it as money comes in, breaking news lands, and sharp bettors weigh in. The book's goal is to balance the action so it profits from the built-in margin regardless of who wins. You are betting against the operator.\n\nA prediction market works like a stock exchange. It lists an event contract — typically a 'Yes' and a 'No' that together pay out $1 — and lets traders buy and sell with one another. The platform does not take a position; it matches orders and collects a fee. The price floats wherever supply and demand settle. You are trading against other people, not the house.",
      },
      {
        heading: 'How each one makes money: the vig vs. the fee',
        body: "A sportsbook earns its keep through the vig (short for vigorish), also called juice or the margin. It is not a charge at checkout; it is a haircut built into the odds themselves. Add up the implied probabilities of both sides of a typical line and they sum to more than 100% — often a few points above it on a standard two-way market. That overround is the book's edge, though it varies widely by sport, market type, and operator, and tends to run higher on props and parlays than on main lines.\n\nA prediction market cannot hide a margin the same way, because 'Yes' and 'No' must add to $1. If 'Yes' trades at 56 cents, 'No' has to be 44 cents — arbitrage closes any gap almost instantly, so the two sides sum to roughly 100%. The exchange instead charges an explicit trading or settlement fee, structurally closer to a brokerage than a bookmaker.",
      },
      {
        heading: 'Reading the price as a probability',
        body: "On a prediction market the price is the probability. A contract trading at 62 cents implies the market thinks the event is about 62% likely, because the contract pays $1 if it happens and $0 if it does not. This is the cleanest way to read crowd sentiment as a number.\n\nSportsbook odds carry the same information but are dressed in different formats — American (-150, +220), decimal (1.67, 3.20), or fractional. To translate, convert the odds to their implied probability, then remember that the book's margin inflates the total. Because the vig pads both sides, raw sportsbook odds slightly overstate each outcome's chance, while exchange prices, summing to about 100%, give a tighter read on the underlying probability. Treat any single quote as an estimate, not a guarantee — markets are probabilities, not advice.",
      },
      {
        heading: 'Who regulates what',
        body: 'In the United States the two live under different legal regimes. Sports betting is regulated state by state. After the Supreme Court struck down the federal PASPA ban in Murphy v. NCAA on May 14, 2018, each state set its own rules; sportsbooks operate under state gaming commissions and tribal compacts where they are licensed.\n\nPrediction markets that list event contracts are overseen federally by the Commodity Futures Trading Commission (CFTC). Kalshi, founded in 2018, won CFTC approval as a designated contract market in November 2020 and launched to the public in 2021. Polymarket, founded in 2020, runs on blockchain infrastructure; it settled with the CFTC in January 2022 for offering unregistered binary options and later pursued a U.S.-regulated path. Through 2026 there has been active legal and political tension over whether CFTC-licensed sports event contracts can operate nationwide, bypassing the state system — a question still moving through rulemaking and the courts, with federal and state rulings pointing in different directions.',
      },
      {
        heading: 'What each is actually built for',
        body: "A sportsbook is built for betting on sports: deep menus of game lines, player props, parlays, live in-game wagering, and promotions, with prices tuned for entertainment volume.\n\nA prediction market is built to price uncertainty across many domains — elections, economics, policy, weather, and sports among them. Its outputs double as data: a continuously updated probability that researchers, journalists, and the curious can read as a signal of what a crowd of traders collectively expects. That is why a news desk might watch the contract price even without any interest in placing a trade. Neither tool tells you what will happen; both give you a market's best current guess.",
      },
    ],
    faq: [
      {
        q: 'What is the difference between a prediction market and a sportsbook?',
        a: 'A sportsbook is a bookmaker that takes the other side of your bet and profits from a margin baked into the odds. A prediction market is a peer-to-peer exchange where traders buy and sell event contracts from each other, and the platform charges a fee instead of setting the line. One is the house; the other is a marketplace.',
      },
      {
        q: 'What is the vig in sports betting?',
        a: "The vig (vigorish, or juice) is the margin a sportsbook builds into its odds. It is not a separate charge but a haircut on the price, which is why the implied probabilities of both sides add up to more than 100%. That extra slice above 100%, called the overround, is the book's built-in edge. It varies by sport, market, and operator.",
      },
      {
        q: 'Why do prediction market prices add up to 100%?',
        a: "On a prediction market, the 'Yes' and 'No' contracts together pay exactly $1, so their prices must sum to about $1, or 100%. If they drift apart, arbitrage traders quickly close the gap. The exchange makes money from an explicit trading or settlement fee rather than from a hidden margin in the price.",
      },
      {
        q: 'Are prediction markets legal in the US?',
        a: 'Prediction markets that list event contracts are regulated federally by the CFTC. Kalshi received CFTC approval as a designated contract market in 2020. Whether CFTC-licensed sports event contracts can operate nationwide, alongside state-regulated sportsbooks, remained an open and contested legal question as of 2026.',
      },
      {
        q: 'How do I convert prediction market prices to sportsbook odds?',
        a: "A prediction market price in cents is already an implied probability — 62 cents means about 62% likely. To compare with a sportsbook, convert its American or decimal odds to implied probability. Remember the book's vig inflates both sides past 100%, so its raw odds slightly overstate each outcome's true chance versus the exchange.",
      },
    ],
    relatedTopics: ['Politics', 'Sports', 'Economics', 'Finance'],
  },
  {
    slug: 'are-prediction-markets-legal',
    title: 'Are Prediction Markets Legal in the US? CFTC Rules Explained',
    h1: 'Are Prediction Markets Legal in the United States?',
    metaDescription:
      'Are prediction markets legal in the US? A plain guide to CFTC oversight, Kalshi and Polymarket, the sports event-contract fight, and how the rules keep shifting.',
    intro:
      'The short answer is that the main US prediction markets operate legally under federal oversight, but the rules are unsettled and keep changing. Platforms like Kalshi and Polymarket list "event contracts" that are regulated by the Commodity Futures Trading Commission (CFTC), the same agency that oversees commodity-futures markets, rather than by state gambling regulators. That federal status is the heart of an active legal fight: several states argue some of these contracts, especially on sports, are gambling that requires a state license, while the CFTC argues federal law preempts them. This page explains who regulates prediction markets, how Kalshi and Polymarket each got to their current standing, what the sports dispute is about, how all of this differs from state-regulated sports betting, and why the picture is still moving. None of this is legal or financial advice.',
    sections: [
      {
        heading: 'Who regulates prediction markets: the CFTC',
        body: 'In the United States, the prediction markets people actually use are regulated as financial markets, not as casinos. The relevant law is the Commodity Exchange Act (CEA), and the relevant regulator is the Commodity Futures Trading Commission (CFTC), an independent federal agency. The products are "event contracts" — binary yes/no contracts that pay out based on whether a defined event happens — and they trade on exchanges the CFTC has approved as designated contract markets (DCMs).\n\nA DCM is a federally licensed, self-regulating exchange that must follow CFTC rules on market integrity, reporting, position limits, and customer protection. This is the same category of license held by long-established futures venues. By April 2026, several CFTC-regulated DCMs had collectively self-certified thousands of event contracts, according to a Norton Rose Fulbright analysis. "Self-certify" matters here: under the CEA, an exchange can typically list a new contract by certifying to the CFTC that it complies with the rules, rather than waiting for case-by-case approval. The CFTC can review and, if it objects, move to block a contract.\n\nThe practical effect is that a market is generally legal at the federal level if it runs on a CFTC-regulated exchange and lists contracts that comply with the CEA. The unsettled questions are which contracts qualify, and whether states can still apply their own gambling laws on top. Those are the open fights described below.',
      },
      {
        heading: 'Kalshi: the CFTC-regulated path',
        body: "Kalshi is the clearest example of the regulated route. Its operating entity, KalshiEX LLC, received CFTC designation as a contract market in November 2020 and launched publicly in 2021, making it an exchange built inside the federal framework from the start rather than offshore.\n\nIts standing has been tested in court. Kalshi sought to list contracts on which party would control Congress, and the CFTC tried to block them as prohibited \"gaming\" or election contracts. In September 2024 a federal district court ruled in Kalshi's favor, reasoning that elections are not games and that the underlying events were not themselves unlawful, so the contracts did not fall under the CEA's prohibited categories. The CFTC sought a stay; the US Court of Appeals for the D.C. Circuit declined to halt the contracts in October 2024, letting them go live, and in 2025 the CFTC dropped its appeal, ending that particular challenge.\n\nThe harder fight moved to sports and to the states. After Kalshi self-certified sports event contracts in January 2025, several state gambling regulators sent it cease-and-desist orders in the following months, arguing the contracts were unlicensed sports wagering. Kalshi sued. In a notable win, the Third Circuit Court of Appeals in April 2026 upheld an injunction barring New Jersey from enforcing its gambling laws against Kalshi's sports contracts, on the theory that the CEA preempts state interference with CFTC-regulated markets. Other state cases remain open, so Kalshi's federal license is settled while its state-by-state position is not.",
      },
      {
        heading: 'Polymarket: a settlement, a wind-down, and a regulated return',
        body: "Polymarket took the opposite route and had to course-correct. It launched in 2020 as a crypto-based platform settling trades in the USDC stablecoin, and it operated without a US license. In January 2022 the CFTC settled with the company over running an unregistered event-contract facility, imposing a $1.4 million penalty and a cease-and-desist order. As part of that resolution, Polymarket wound down noncompliant contracts and blocked US customers, and it stayed closed to US users for several years.\n\nThe path back ran through a license rather than a workaround. In 2025 Polymarket acquired QCEX — a CFTC-licensed derivatives exchange (QCX, LLC) and an associated clearinghouse — in a deal reported at about $112 million, giving it federally regulated infrastructure to operate domestically. After the CFTC cleared the exchange, Polymarket received an amended order of designation in late November 2025, allowing it to bring US users back through that regulated entity. Reporting indicates US access reopened around December 2025, initially as a controlled rollout rather than an instant full launch.\n\nSo Polymarket's US legality today rests on operating through its CFTC-licensed exchange, not on its earlier offshore model. As with any platform, eligibility and the exact rollout can change, and the company's own site is the authoritative source for who can currently use it.",
      },
      {
        heading: 'The sports event-contract fight: CFTC versus the states',
        body: 'The sharpest unresolved question is sports. Prediction-market exchanges argue that a contract on who wins a game is an event contract under the CEA, and therefore federally regulated and shielded from state gambling law. Many state regulators disagree, framing the same product as sports betting that requires a state sportsbook license. Because both sides have plausible legal arguments, this is being fought jurisdiction by jurisdiction.\n\nThe disputes are concrete. Beyond New Jersey, multiple states moved against the exchanges in 2026: per a Norton Rose Fulbright account, the CFTC and Department of Justice filed suits in April 2026 contesting enforcement actions by Illinois, Connecticut, and Arizona; Arizona had separately filed criminal charges against KalshiEX in March 2026. Results have diverged — the Third Circuit sided with federal preemption in the New Jersey matter, while other cases remain pending — which is exactly the kind of split that legal commentators, including a Stanford Law analysis, expect could ultimately reach the Supreme Court.\n\nThe CFTC is also writing rules instead of relying only on litigation. On June 10, 2026 it issued a proposed framework for event contracts, open for public comment (with a deadline reported as July 27, 2026). As described in coverage from outlets including ESPN and CNN, the proposal would let most sports contracts stand as contributing to price discovery, while moving to bar contracts seen as manipulable or against the public interest — such as those on player injuries, officiating calls, in-game altercations, youth sports, and pitch-by-pitch outcomes. Because it is a proposal under comment, the details can change before anything is final.',
      },
      {
        heading: 'How this differs from state-regulated sports betting',
        body: 'It helps to separate two distinct legal worlds that are now colliding. Traditional sports betting in the US is regulated state by state. After the Supreme Court struck down the federal ban (PASPA) in its 2018 Murphy v. NCAA decision, individual states became free to legalize and license sportsbooks, and a large share of states have since done so, each with its own regulator, taxes, and rules. In that model, a licensed sportsbook is the "house": it sets the odds and takes the other side of your wager.\n\nPrediction markets are structured to look like exchanges, not sportsbooks. There is no house setting a line; traders buy and sell yes/no contracts with each other, and the price emerges from supply and demand the way it does on a futures exchange. That is the basis for claiming federal CFTC jurisdiction under the CEA rather than state gambling law. State regulators counter that, whatever the structure, betting on a game\'s outcome is functionally sports wagering and should sit under their licensing regimes.\n\nThe practical upshot for a reader is that legality depends on which framework applies, and that is precisely what courts and the CFTC are deciding. A CFTC-regulated event contract may be available nationwide under federal law even where the same outcome would otherwise require a state sportsbook license, but that federal-preemption position is being actively contested. None of this is legal advice; anyone weighing participation should confirm the current status for their own state on the platform itself, and treat market prices as crowd-implied probabilities that can be wrong, not as a recommendation to trade.',
      },
    ],
    faq: [
      {
        q: 'Are prediction markets legal in the United States?',
        a: "The major platforms operate legally under federal oversight: Kalshi and Polymarket list event contracts regulated by the CFTC as designated contract markets, not as state-licensed gambling. The unsettled part is whether states can apply their own gambling laws to certain contracts, especially sports, which is being fought in court. Availability can vary by state, so check the platform's current status for your location, and treat none of this as legal or financial advice.",
      },
      {
        q: 'Is Polymarket legal in the US now?',
        a: "Polymarket blocked US users after a 2022 CFTC settlement over running an unregistered event-contract facility, which carried a $1.4 million penalty. In 2025 it acquired a CFTC-licensed exchange (QCEX) and received an amended designation in late November 2025, reopening US access through that regulated entity around December 2025. Eligibility and rollout details can change, so confirm current rules on Polymarket's own site.",
      },
      {
        q: 'Is Kalshi legal in all 50 states?',
        a: 'Kalshi holds a federal CFTC designated-contract-market license, held since November 2020, which is the basis for nationwide operation. But several states have challenged its sports contracts as unlicensed wagering, and real-money availability can vary by state while those disputes continue. A federal appeals court sided with Kalshi against New Jersey in April 2026, though other state cases remain open; this is not legal advice.',
      },
      {
        q: 'What is the difference between a prediction market and sports betting?',
        a: 'A licensed sportsbook is the house: it sets the odds and takes the other side of your wager under state gambling law. A prediction market is structured as an exchange where traders buy and sell yes/no contracts with each other and the price emerges from supply and demand, which is the basis for federal CFTC regulation. Whether that distinction holds for sports outcomes is exactly what courts and regulators are deciding, so it remains contested.',
      },
      {
        q: 'Who regulates prediction markets in the US?',
        a: 'At the federal level, prediction markets are regulated by the Commodity Futures Trading Commission (CFTC) under the Commodity Exchange Act, which treats their products as event contracts traded on licensed exchanges. State gambling regulators argue some of these contracts fall under their authority instead, creating an active federal-versus-state dispute. The CFTC also proposed a new event-contract rule framework on June 10, 2026, so the regulatory details are still being settled and are not advice.',
      },
    ],
    relatedTopics: ['Politics', 'Finance', 'Sports', 'Crypto'],
  },
  {
    slug: 'how-prediction-markets-make-money',
    title: 'How Do Prediction Markets Make Money? Fees, Spreads, and the $1 Payout',
    h1: 'How Prediction Markets Make Money',
    metaDescription:
      'How prediction markets make money: trading fees, the maker-taker model, the bid-ask spread, and why an exchange like Kalshi or Polymarket is not your counterparty.',
    intro:
      'A prediction market exchange does not win when you lose. That is the structural difference between a venue like Kalshi or Polymarket and a sportsbook, and it explains nearly everything about how these platforms make money. An exchange matches one trader who thinks an outcome is likely against another who thinks it is not, and it takes a small, transparent cut of the trade — not a margin baked into the price. This page walks through where that money comes from: transaction fees and the maker-taker model, the bid-ask spread, what the exchange does and does not earn on deposits and settlement, and how Kalshi and Polymarket each monetize as of mid-2026. It also explains where the familiar "$1 per winning share" payout comes from, and why that number is fixed rather than a number the house chooses. Prices on these markets are crowd-implied probabilities that can be wrong, and nothing here is financial advice.',
    sections: [
      {
        heading: 'The exchange is a marketplace, not your counterparty',
        body: "The first thing to understand is who you are trading against. On a traditional sportsbook, the book is the other side of your wager. It sets the odds, accepts your action, and profits from the \"vig\" (also called vigorish or juice) — a margin built into the price so the book comes out ahead regardless of which side wins. A typical point-spread line of -110 on both sides is the classic example: the extra cost above even money is the book's cut, and it works out to roughly a 4.5 to 5 percent edge on a standard line, and more on props and parlays. The sportsbook's revenue and the bettor's loss are two sides of the same coin.\n\nA prediction market exchange works differently. It does not take the other side of your trade. When you buy a YES share, someone else on the platform is selling it (or buying the matching NO side), and the exchange simply matches the two orders and records the trade. Its revenue is a separate, disclosed transaction fee — closer to the commission a stock brokerage or a betting exchange charges than to a bookmaker's margin. Because the venue is neutral to the outcome, it has no incentive to shade prices against you. The price you see is set by the order book — by what other traders are willing to pay — not by a house trying to protect a margin.\n\nThis is why the money-weighted probabilities on these markets are useful as a news signal in the first place: the number reflects what participants with capital at stake collectively believe, rather than a line engineered to balance a book. That signal can still be wrong, thinly traded, or moved by a few large players, but the mechanism producing it is a marketplace, not a counterparty.",
      },
      {
        heading: 'Trading fees and the maker-taker model',
        body: "The core revenue line for a prediction market exchange is a per-trade transaction fee. The detail that surprises newcomers is that the fee is usually not a flat percentage — it scales with the price of the contract, and it is lowest exactly where you might expect a fee to be highest.\n\nKalshi's published taker fee, as of 2026, is $0.07 x C x (1 - C) per contract, where C is the contract price between $0.01 and $0.99. That C x (1 - C) term means the fee peaks when a market is a coin flip. At a 50-cent price the taker fee is about 1.75 cents per contract — its maximum — and it shrinks toward a fraction of a penny as the price moves toward 1 cent or 99 cents. In effect, the more lopsided (more certain) the market, the less you pay to trade it. Polymarket adopted a similar shape in 2026: its taker fee follows C x feeRate x p x (1 - p), with the rate set per category, and it likewise peaks at the 50 percent price.\n\nThe \"maker-taker\" split decides who pays. A taker is someone who removes liquidity by crossing the spread to hit an order already resting on the book; a taker pays the full fee. A maker is someone who posts a limit order that sits on the book and waits to be filled; the maker is adding liquidity, so the platform charges them far less — Kalshi's maker fee is 25 percent of the taker fee (about 0.44 cents at the 50-cent price) — or even pays them a rebate, as Polymarket does through its maker rebate program. The logic is the same on a stock exchange: makers make the market deeper and tighter, so they are subsidized; takers consume that depth, so they pay. None of this is advice on how to trade — it simply explains where the platform's fee comes from.",
      },
      {
        heading: 'The bid-ask spread: a cost you pay to traders, not the house',
        body: "Fees are not the only cost of trading, but the other main one — the bid-ask spread — generally does not go to the exchange. The spread is the gap between the highest price someone is currently willing to pay (the bid) and the lowest price someone is willing to sell at (the ask). If YES shares are bid at 47 cents and offered at 50 cents, a trader who wants in immediately buys at 50 and a trader who wants out immediately sells at 47; that 3-cent gap is the cost of demanding instant execution.\n\nIn a pure order-book exchange, that spread is captured by the market makers on the other side of those orders — the traders posting limit orders — not by the platform. This is a real distinction from a sportsbook, where the equivalent margin is the house's. On a deep, heavily traded market the spread can be a single cent or less; on a thin market it can be wide, which is itself useful information about how confident or liquid the crowd's view really is.\n\nSome venues, particularly in their early form, used an automated market maker (an algorithm that always quotes a price from a pooled reserve) instead of, or alongside, a pure order book. There the spread and pricing behave differently, but the principle holds: the exchange's own take is the disclosed fee, while the spread is the price of liquidity set by whoever is on the other side. When you compare the \"cost\" of two platforms, the honest comparison is fee plus typical spread, not the headline fee alone.",
      },
      {
        heading: 'Deposits, withdrawals, and where the $1 payout comes from',
        body: 'Beyond trading, exchanges can earn — or choose not to earn — on the money sitting on the platform. On Kalshi, ACH bank transfers in and out are free, while wire transfers carry a fee in the roughly $25 to $30 range (often charged by the bank rather than Kalshi itself), and there is no separate settlement fee for holding a contract to expiry. Polymarket charges nothing for USDC deposits or withdrawals itself, though the blockchain networks and third-party on-ramps it relies on can impose their own costs. A quieter revenue source is the interest, or net interest margin, an operator can earn on the pooled customer funds and collateral it holds — money parked on the platform that the operator can invest while it sits there. Increasingly, the data itself is a business: Polymarket has partnered with Intercontinental Exchange (ICE) to distribute real-time market-sentiment data to institutions, a revenue line with no per-trade fee attached.\n\nThe payout side is the part that confuses people most, and it is the simplest. Every contract is structured so that one full share is worth exactly $1.00 at resolution. If the event resolves YES, each YES share pays $1.00 and each NO share pays $0.00; if it resolves NO, the reverse. That $1 ceiling is not a number the house pays out of its own pocket — it is the total of what the two sides put in. A buyer who paid 60 cents for a YES share and a buyer who paid 40 cents for the matching NO share have together funded exactly $1.00; the winner collects that dollar, the loser collects nothing, and the exchange has already taken its small fee at the moment of the trade. Because every YES share and its matching NO share always sum to $1, the price of a YES share reads directly as an implied probability: 60 cents means the market collectively prices the outcome at roughly 60 percent. Those implied probabilities can be mispriced or move sharply on new information, and none of this is a recommendation to trade.',
      },
      {
        heading: 'How Kalshi and Polymarket each monetize and settle',
        body: "The two largest venues make money the same way in principle but differ in the details, partly because they are regulated and built differently.\n\nKalshi is a CFTC-regulated US exchange. Its revenue is the transaction fee described above, and its markets are cash-settled in US dollars: each contract names \"source agencies\" in its terms — the official data or governing body whose result determines the outcome — filed with the regulator as part of Kalshi's self-certification. When the underlying result is known, the exchange confirms it against that published rule and credits winning accounts, typically within hours. Clearing runs through Kalshi's registered clearing entity, and disputes are handled inside that regulated framework rather than by a vote.\n\nPolymarket settles its core international markets on-chain in USDC and, as of 2026, charges category-based taker fees while rewarding makers — with some categories, such as geopolitics and world events, kept fee-free. It resolves outcomes through the UMA optimistic oracle: after a market closes, anyone can propose the result by posting a bond, a challenge window opens, and if no one disputes it the market settles; disputed cases escalate to token-holder voting and can take longer. Polymarket's US route runs through a CFTC-registered exchange it acquired to re-enter the American market. The practical takeaways: read each market's resolution rule before you trust the number, expect a delay between an event happening and a market paying out, and remember that resolution can occasionally be contested — all reasons a market price is a probability estimate, not a settled fact, and not financial advice.",
      },
    ],
    faq: [
      {
        q: 'How do prediction markets make money?',
        a: 'They charge a small, disclosed transaction fee each time two traders are matched, usually structured so the fee is largest on coin-flip markets near 50 cents and smallest on near-certain ones. Some venues also earn interest on customer funds held on the platform and sell their market data to institutions. Unlike a sportsbook, the exchange is not the other side of your trade, so it does not profit from your losses. None of this is financial advice.',
      },
      {
        q: 'Is a prediction market the same as a sportsbook?',
        a: 'No. A sportsbook is your counterparty: it sets the odds, takes the other side of your wager, and builds a margin (the "vig") into the price to profit regardless of the result. A prediction market exchange matches you against another trader and takes a separate, transparent fee, so its revenue does not depend on the outcome. That neutrality is part of why the prices are read as a probability signal, though those prices can still be wrong.',
      },
      {
        q: 'What is the maker-taker model on Kalshi and Polymarket?',
        a: "A taker removes liquidity by crossing the spread to fill an order already on the book and pays the full fee; a maker posts a resting limit order that adds liquidity and pays much less, or receives a rebate. Kalshi's maker fee is 25 percent of its taker fee, and Polymarket pays maker rebates by category. The model exists to reward traders who make markets deeper and tighter. This is an explanation of mechanics, not a trading recommendation.",
      },
      {
        q: 'Why is a winning share worth exactly $1?',
        a: 'Each contract is defined so that one share pays $1.00 if it resolves in your favor and $0.00 if it does not. That dollar is funded by the two sides of the trade together — a 60-cent YES share and a 40-cent NO share sum to $1.00 — not paid by the exchange. Because the two sides always add to $1, the price of a share reads directly as an implied probability, which can be mispriced and is not advice.',
      },
      {
        q: 'Do prediction markets charge deposit or withdrawal fees?',
        a: 'It varies by platform. Kalshi offers free ACH transfers but charges a flat fee for wires and has no separate settlement fee, while Polymarket does not charge for USDC deposits or withdrawals itself, though blockchain networks and third-party on-ramps may add their own costs. Always check the current fee schedule on the platform directly, since these terms change. This is general information, not financial advice.',
      },
    ],
    relatedTopics: ['Finance', 'Economics', 'Crypto'],
  },
  {
    slug: 'is-polymarket-legit',
    title: 'Is Polymarket Legit and Safe? A Neutral Look at the Risks',
    h1: 'Is Polymarket Legit? Trust, Safety, and the Real Risks',
    metaDescription:
      'Is Polymarket legit and safe? A neutral look at its CFTC history, USDC custody on Polygon, UMA oracle resolution, contested disputes, and the real risks to weigh.',
    intro:
      '"Is Polymarket legit?" is really three questions: is it a real, functioning platform; is it operating within the law; and is your money safe on it. Polymarket is a genuine prediction market — founded in 2020 by Shayne Coplan, it has handled billions of dollars in trading volume and is widely cited in news coverage — but "legit" and "risk-free" are not the same thing. It settled with US regulators in 2022, blocked US users for years, and only built a licensed path back into the country in late 2025. Its funds sit in blockchain smart contracts rather than an insured bank, and its market-resolution system has drawn repeated scrutiny over contested outcomes. This page lays out what Polymarket is, how it custodies money, how markets resolve, the disputes that have raised concerns, and how a careful reader should weigh its trustworthiness. None of this is financial advice.',
    sections: [
      {
        heading: 'What "legit" means for a platform like this',
        body: 'Polymarket is a real, operating prediction market, not a scam in the ordinary sense. Each market poses a clear yes-or-no question with a defined resolution — whether a candidate wins, whether an indicator crosses a threshold by a date — and traders buy "Yes" or "No" shares whose prices move with the crowd\'s expectations. A share priced at 0.62 reflects a market-implied probability of roughly 62 percent. Those prices are a money-weighted estimate of likelihood, not a guarantee, and they can be wrong.\n\nThe platform has handled very large volumes: during the 2024 US presidential race, more than 3 billion dollars in contracts traded on the outcome, and reporters increasingly cite its odds alongside polls. That scale is evidence the mechanics work — orders fill, winning positions pay out — but it is separate from two harder questions that this page focuses on: whether Polymarket is operating legally where you are, and whether your money is safe on it.\n\nThe honest answer is that Polymarket is a legitimate business with a complicated regulatory record and a set of real, specific risks. "Legit" is not a yes-or-no badge here; it is a set of tradeoffs to understand before you decide whether to use it.',
      },
      {
        heading: 'Regulatory history: a 2022 settlement and a 2025 return',
        body: "Polymarket's standing with US regulators has changed sharply over time, and the timeline matters. In January 2022, the US Commodity Futures Trading Commission (CFTC) settled with the company (then operating as Blockratize) for offering unregistered, off-exchange event-based binary options — essentially running a swaps venue without registering as a designated contract market or swap execution facility. Polymarket paid a 1.4 million dollar penalty, agreed to wind down noncompliant contracts, and blocked access for US-based traders. The CFTC noted the company gave \"substantial cooperation,\" which reduced the fine.\n\nScrutiny continued. In November 2024, the FBI raided Coplan's New York apartment and seized electronic devices after Polymarket's election markets drew attention; he was not arrested or charged. In July 2025, the Department of Justice and the CFTC formally ended their investigations without bringing new charges.\n\nThe path back to the US ran through a license. In July 2025, Polymarket acquired QCEX — a CFTC-licensed derivatives exchange (QCX LLC) and clearinghouse — for about 112 million dollars, giving it regulated infrastructure to operate domestically. After the CFTC cleared the exchange and issued an amended order of designation in November 2025, Polymarket reopened to US users on December 3, 2025, beginning with sports markets, with other categories rolling out over time. Eligibility, available categories, and account rules continue to evolve, so confirm the current status on Polymarket's own site rather than relying on a fixed snapshot.",
      },
      {
        heading: 'How it holds your money: USDC on the blockchain, not a bank',
        body: 'Polymarket is crypto-native, and that shapes its safety profile. Traders fund accounts with USDC, a US-dollar-pegged stablecoin issued by Circle, and balances and trades are recorded on the Polygon blockchain. Using a dollar-linked token keeps prices intuitive: a share at 0.62 maps to roughly a 62 percent implied probability, and a winning share pays 1 dollar.\n\nThe platform is largely non-custodial: your USDC and outcome shares live in smart contracts on Polygon, not on a company server. One consequence is that if Polymarket the company shut down, the funds in those contracts would not simply vanish with it. The flip side is that security responsibility shifts toward the user — if you control the private key to a self-custodied wallet and lose it, there is no help desk that can restore access.\n\nWhat this is not is an insured deposit. There is no FDIC or SIPC protection on a prediction-market balance the way there is on a US bank account or brokerage. USDC is designed to hold a 1:1 dollar peg backed by reserves, and Circle publishes regular attestations, but a stablecoin is still not a guaranteed dollar — pegs have wobbled under stress before. If a resolution goes against you, a smart contract is exploited, or a regulator intervenes, there is generally no insurance fund and limited legal recourse to recover money.',
      },
      {
        heading: 'How markets resolve — and why resolution has drawn scrutiny',
        body: 'A market is only as trustworthy as the way it decides who won. When an event concludes, Polymarket settles it through UMA\'s Optimistic Oracle, a decentralized system. Someone proposes the outcome and posts a bond; if no one disputes it within a challenge window (commonly about two hours), it stands. If it is disputed, a counter-bond is posted, and if disagreement persists the question escalates to a vote by holders of UMA\'s token, who weigh evidence before a final ruling. The losing side of a dispute forfeits part of its bond, which is meant to discourage bad-faith proposals.\n\nThis design works smoothly for most clear-cut questions, but it has repeatedly drawn criticism on contested ones. In March 2025, a market on whether Ukraine would agree to a US minerals deal resolved "Yes" — despite no such agreement being publicly reached — after a large UMA holder reportedly cast around 25 percent of the votes in that dispute. A Wall Street Journal investigation reported in May 2026 that, in most disputed markets, more than half the UMA votes came from the ten largest wallets, that a majority of active voters could be linked to live Polymarket accounts, and that in roughly one in five disputes at least one voter held a financial stake in the contract being decided.\n\nUMA and Polymarket have responded with changes — including tighter controls on who can propose outcomes — but the core concern is structural: when the same people who can profit from an outcome also help adjudicate it, resolutions can be contested or, critics argue, captured. Polymarket has also at times been accused of effectively changing how a market reads after trades were placed. For a careful reader, the takeaway is to check exactly how a given market is worded and resolved before treating its settlement as final.',
      },
      {
        heading: 'How to think about its trustworthiness',
        body: "Put together, Polymarket is a legitimate platform with genuine usefulness and a specific risk stack. The mechanics are real and at scale; the legal status is now licensed in the US but still settling into place; and the money sits in uninsured smart contracts resolved by a system that has been contested on its hardest cases. None of those facts make it a fraud, and none of them make it as safe as a regulated brokerage.\n\nA reasonable way to weigh it: separate the signal from the venue. Polymarket's prices are a fast, money-weighted read on what the crowd expects, which is valuable for understanding which stories are moving and how confidence is shifting. That is how Crowdtells uses these markets — as one probability-based input, paired with reporting, never as a verdict. Using the odds as a signal carries no money risk. Putting money on the platform is a different decision, with custody, oracle, resolution, and regulatory risks that fall on you.\n\nIf you are evaluating Polymarket as a user, confirm the current rules in your jurisdiction on the platform itself, understand that balances are not insured, read each market's resolution terms closely, and treat prices as estimates that can be wrong or moved by a few large traders. This page is informational and is not financial, legal, or investment advice.",
      },
    ],
    faq: [
      {
        q: 'Is Polymarket legit and safe to use?',
        a: 'Polymarket is a real, functioning prediction market that has handled billions in volume, so it is legitimate in that sense. "Safe" is more limited: balances are held in USDC smart contracts on the Polygon blockchain, not an FDIC-insured bank, and the platform has faced scrutiny over contested market resolutions. Treat it as a real but uninsured platform with specific risks, and understand that none of this is financial advice.',
      },
      {
        q: 'Is Polymarket legal in the US now?',
        a: "Polymarket blocked US users after a 2022 CFTC settlement, but in 2025 it acquired the CFTC-licensed QCX exchange, received an amended order of designation, and reopened to US users on December 3, 2025, starting with sports markets. Available categories and eligibility are still expanding and can vary, so confirm the current rules in your state directly on Polymarket's site. This is not legal advice.",
      },
      {
        q: 'Is my money insured on Polymarket?',
        a: 'No. Unlike a US bank account or brokerage, a Polymarket balance has no FDIC or SIPC insurance. Funds are held as USDC stablecoin in smart contracts on the Polygon blockchain, which carries smart-contract risk, the possibility of a contested resolution, and the chance that a stablecoin could lose its dollar peg under stress. There is generally no insurance fund to recover losses, and nothing here is financial advice.',
      },
      {
        q: 'How does Polymarket decide who wins a market?',
        a: "Polymarket settles markets using UMA's Optimistic Oracle: someone proposes the outcome and posts a bond, others can dispute it within a challenge window, and unresolved disputes escalate to a vote by UMA token holders. The system works for clear questions but has drawn scrutiny on contested ones, including a March 2025 Ukraine market and a 2026 Wall Street Journal report on voter conflicts of interest. Read each market's resolution terms before trusting its settlement.",
      },
      {
        q: 'Has Polymarket ever been fined or investigated?',
        a: "Yes. The CFTC settled with Polymarket in January 2022 over offering unregistered event contracts, resulting in a 1.4 million dollar penalty, and the company blocked US users afterward. The FBI raided founder Shayne Coplan's home in November 2024, but the DOJ and CFTC ended their investigations without new charges in July 2025. That history is part of weighing its trustworthiness, and this is not financial advice.",
      },
    ],
    relatedTopics: ['Crypto', 'Politics', 'Finance', 'Economics'],
  },
  {
    slug: 'prediction-markets-vs-stock-market',
    title: 'Prediction Markets vs. the Stock Market Explained',
    h1: 'Prediction Markets vs. the Stock Market: What Each One Actually Prices',
    metaDescription:
      'Prediction markets vs the stock market: what each prices, binary event contracts vs equity shares, how price discovery, fees, and CFTC vs SEC regulation differ.',
    intro:
      'A prediction market and a stock market are both exchanges where buyers and sellers meet, and on the surface they can look alike: an order book, a live price, a bid and an ask. But they price fundamentally different things. A prediction market trades binary event contracts that pay a fixed amount if a defined event happens and nothing if it does not, then close once the answer is known. A stock market trades shares of ownership in companies, perpetual claims on future profits that never resolve to a single final value. That one difference flows through everything else: how the price is read, how each exchange discovers it, what fees you pay, and which regulator is in charge. This page compares the two as exchanges, in plain terms, with no investment advice.',
    sections: [
      {
        heading: 'What each one actually prices',
        body: 'A prediction market prices a probability. Each contract is tied to a clearly defined yes-or-no question — will a specific event occur by a stated date — and it pays a fixed amount, usually $1, if the answer turns out to be yes, and $0 if it turns out to be no. The price floats between those two endpoints, so a contract trading at 60 cents is read as the market estimating roughly a 60 percent chance. The contract has a built-in finish line: once the event is decided, it settles at $1 or $0 and ceases to exist.\n\nA stock prices a perpetual claim on a business. A share is a unit of ownership in a company — a residual claim on its assets and future cash flows after creditors are paid, with rights that can include dividends and a vote in corporate matters. There is no fixed payout and no resolution date. The price reflects what buyers and sellers collectively expect the company to be worth over an open-ended future, which is why two reasonable people can value the same stock very differently and why its price has no natural ceiling at $1. A prediction contract answers a question and then closes; a stock represents an ongoing stake that, in principle, can trade forever.',
      },
      {
        heading: 'Binary event contracts vs. equity shares',
        body: 'The instruments themselves are built differently. An event contract is binary and self-extinguishing. Yes and No together pay out exactly $1, so their prices are tightly linked — if Yes trades at 56 cents, No must trade near 44 cents, because anyone could otherwise lock in a risk-free gain until the gap closes. The contract is a wager on an outcome, not a stake in anything that keeps producing value, and its entire lifespan runs from listing to a single settlement.\n\nAn equity share is open-ended and divisible into a real business. Owning it makes you a part-owner entitled to a slice of whatever the company generates and distributes over time. It can pay dividends, be split, be bought back, or be diluted by new issuance, and it carries voting rights that an event contract has no analog for. Importantly, a share is not a claim that pays out a fixed sum on a known date; its value is whatever the next buyer will pay, which is why a stock can compound for decades or fall to near zero without ever reaching a defined endpoint.',
      },
      {
        heading: 'How price discovery works in each',
        body: 'Both venues rely on the same core machinery — a continuous order book where traders post limit orders to buy and sell, and incoming orders match against the best available price, typically by price-then-time priority. Market makers on both sides quote two-way prices and earn the bid-ask spread for standing ready to trade, supplying liquidity and helping the price update as information arrives. In that mechanical sense, an event-contract exchange and a stock exchange discover prices the same way.\n\nWhat differs is what new information does to the price. On a prediction market, the question is narrow and the price is anchored between 0 and 100 cents, so news that bears directly on the event — a poll, a data release, a court ruling, a final whistle — pushes the implied probability toward one end and, at resolution, all the way to $1 or $0. On a stock market, the inputs are open-ended: earnings, interest rates, competition, management, and broad sentiment all feed an estimate of long-run cash flows that has no fixed target. A prediction price is collapsing toward a known answer over a finite horizon; a stock price is a moving estimate with no settlement to converge on. Both, importantly, are crowd estimates that can be wrong.',
      },
      {
        heading: 'Fees and mechanics',
        body: 'The cost structures rhyme but are not identical, and the specifics change over time, so treat any figure as illustrative and check the venue. Prediction-market exchanges generally charge an explicit, transparent fee rather than hiding a margin in the price — commonly a small taker fee on trades, often with no separate charge to settle a winning contract at $1. Because Yes and No must sum to about $1, the exchange cannot pad the line the way a bookmaker would; it earns the fee and the spread, not the outcome. Settlement happens when the event resolves, sometimes within hours, and on some platforms after an oracle or dispute window completes.\n\nStock trading has its own mechanics. Many brokers advertise zero commission on US stock trades and instead earn from spreads, order routing, margin lending, and other services; exchanges and regulators also levy small fees. A defining mechanical difference is settlement: US stock trades settle on a T+1 cycle, meaning ownership and cash change hands one business day after the trade, and the position then simply persists in your account with no expiration. A prediction contract, by contrast, is always counting down to a date when it will pay out and disappear.',
      },
      {
        heading: 'What each one is good for',
        body: 'They are built for different jobs, and the cleanest way to choose is to ask what you are trying to do. A prediction market is built to price a specific, time-bounded uncertainty and to surface it as a single readable number. That makes it useful as a signal: a continuously updated, money-weighted estimate of how likely a defined event is, which journalists, researchers, and readers can watch even with no intention of trading. Its payoff is binary and its horizon is fixed, so it answers "how likely is this, and what is the market pricing right now," then closes the book.\n\nA stock market is built for long-horizon ownership and capital formation. Buying a share is taking a stake in a business and its future earnings, with the aim of participating in growth and income over years, not resolving a question by a deadline. It is where companies raise money and where investors hold open-ended, compounding (and risk-bearing) positions. Neither exchange tells you what will happen — a prediction price is a crowd-implied probability that can be wrong, and a stock price is a contested estimate of future value. Both carry real risk of loss, and none of this is financial advice.',
      },
    ],
    faq: [
      {
        q: 'What is the difference between a prediction market and the stock market?',
        a: 'A prediction market trades binary event contracts that pay a fixed amount, usually $1, if a defined event happens and $0 if it does not, then settle and close once the answer is known. A stock market trades shares of ownership in companies — perpetual claims on future profits with no fixed payout and no resolution date. One prices the probability of a specific outcome; the other prices an open-ended stake in a business.',
      },
      {
        q: 'Is a prediction market contract like a stock?',
        a: "Not really. Both trade on an exchange with an order book and a live price, but a prediction contract is a binary bet that resolves to $1 or $0 on a known date and then disappears. A stock is a residual claim on a company's assets and future cash flows that can pay dividends, carry a vote, and trade indefinitely with no built-in payout or expiration.",
      },
      {
        q: 'How is a prediction market price different from a stock price?',
        a: "A prediction market price is bounded between 0 and 100 cents and read directly as an implied probability — 60 cents means the market estimates about a 60 percent chance. A stock price has no fixed ceiling and reflects an open-ended estimate of a company's future cash flows. The prediction price converges toward a known answer over a finite horizon; the stock price is a moving estimate with no settlement to converge on.",
      },
      {
        q: 'Are prediction markets regulated like the stock market?',
        a: 'No, they sit under different US regulators. Stocks are securities overseen by the Securities and Exchange Commission (SEC). Prediction-market event contracts are treated as derivatives under the Commodity Exchange Act and overseen by the Commodity Futures Trading Commission (CFTC), the same agency that regulates futures, and they trade on CFTC-licensed designated contract markets.',
      },
      {
        q: 'Can you make money on prediction markets like stocks?',
        a: 'Both let you buy low and sell high before settlement, but the risk profiles differ. A prediction contract has a capped payoff — it can only settle at $1 or $0 — and a fixed deadline, so a losing position goes to zero on a known date. A stock has open-ended upside and downside and no expiration. Both carry real risk of loss, prices are crowd estimates that can be wrong, and none of this is financial advice.',
      },
    ],
    relatedTopics: ['Finance', 'Economics', 'Politics', 'Crypto'],
  },
  {
    slug: 'what-moves-prediction-market-odds',
    title: 'What Moves Prediction-Market Odds? How Prices Change | Crowdtells',
    h1: 'What moves prediction-market odds',
    metaDescription:
      'What moves prediction-market odds: how news, order flow, liquidity, informed traders, time decay, and cross-platform arbitrage push implied probabilities up or down.',
    intro:
      'A prediction-market price is a number between 0 and 100 cents that doubles as a probability: a contract trading at 65 cents implies the market thinks the outcome is about 65 percent likely right now. That price is not set by an editor or a bookmaker. It moves continuously as people buy and sell, and each trade nudges the implied probability up or down. This page explains the mechanisms behind those moves: how fresh information gets priced in, how order flow and liquidity shape the size of a move, why large or informed traders matter, how prices tend to settle as a resolution date approaches, and how arbitrage keeps the same question priced similarly across platforms. Throughout, keep one thing in mind: these prices are crowd-implied probability estimates, not facts, and they can be wrong. Nothing here is financial advice.',
    sections: [
      {
        heading: 'New information is the main driver',
        body: "The single biggest force on a prediction-market price is new information. Markets aggregate what many independent participants believe, and a price represents a money-weighted average of those views. When something changes what people expect, they trade, and the price moves to a new level that reflects the updated consensus.\n\nThe kinds of information that move odds are the same kinds that move the underlying story: a poll release, an economic data print (jobs, inflation, GDP), a company's earnings report, a court ruling, an official statement or policy announcement, a candidate dropping out, an injury before a match, or breaking news of any kind. A surprise relative to expectations tends to produce the sharpest move, because the market had already priced in the consensus forecast; what trades is the gap between what was expected and what actually happened.\n\nThis is why a market price often reacts within seconds of a headline while a poll average or a pundit takes days to catch up. The price is a live estimate that updates the moment a participant with conviction acts on what they just learned. It is also why the price can be jumpy: an early, thin report can move it, and a later correction can move it back.",
      },
      {
        heading: 'Order flow, liquidity, and the size of a move',
        body: 'Every move happens through trading. On most prediction markets, buy and sell orders meet in a central limit order book, matched by price and time. The best available prices to buy and to sell sit slightly apart, and that gap is the bid-ask spread. A trade that lifts the lowest ask, or hits the highest bid, sets a new last price, which is what most people read as "the odds."\n\nHow far a given trade moves the price depends on liquidity, specifically market depth: how many contracts are resting at each price level. A deep market has many orders stacked close together, so even a large trade only walks the price a little and the spread stays tight. A thin market has gaps in the book, so a modest order can jump the price several cents and the spread is wide. This is why an identical piece of news can barely budge a heavily traded headline market yet swing a quiet, obscure one sharply.\n\nMarket makers smooth this out by continuously posting both buy and sell orders, earning the spread in exchange for supplying liquidity and absorbing temporary imbalances. When they pull back, during volatile moments or in unpopular markets, spreads widen and prices get noisier. A practical takeaway: in a thin market, a price move may reflect one trader\'s order hitting an empty book rather than a real shift in what the crowd believes.',
      },
      {
        heading: 'Informed traders, conviction, and capital at risk',
        body: "Prediction markets weight opinions by money, not by headcount. A participant who is confident can back that view with more capital, and a position only pays if the outcome actually resolves their way. This structure rewards being right and penalizes being wrong, which gives informed participants an incentive to trade until the price reflects what they know.\n\nThat is the core argument for why these prices can be useful: someone who has done the work, or who holds private information, can move the price toward the truth and profit from doing so, while uninformed noise tends to cancel out across many participants. A sudden, sustained move on no public news is sometimes the market reacting to a well-funded trader who knows or believes something the rest of the crowd does not yet.\n\nThe same mechanism is also a limit. Thinly traded markets can be moved by a single large order, sentiment and crowd psychology can push prices away from a fair estimate, and a market can simply be wrong when the crowd is collectively mistaken or when few informed participants are present. A price is the crowd's best money-weighted guess at a moment in time, not a guarantee, and it should be read alongside the underlying reporting rather than in place of it.",
      },
      {
        heading: 'Time decay, resolution, and how the rules anchor the price',
        body: "As a market approaches its resolution date, the price tends to converge. Uncertainty narrows, more participants pile in near the deadline, the spread tightens, and the price grinds toward 0 or 100 cents as the outcome becomes clear. Far from resolution, prices are more volatile because there is more time for new information to arrive and reverse the picture; close to resolution, each remaining piece of news matters less and the price is harder to move.\n\nWhat ultimately pins the price is the resolution rule: the specific, written source and criterion that decides the outcome. Read it before trusting a number, because ambiguous wording is a real source of error. On Polymarket, markets resolve through UMA's optimistic oracle, where a proposed outcome stands unless someone disputes it within a set window, and disputes escalate to a tokenholder vote. Kalshi, a U.S. exchange regulated by the CFTC, resolves contracts against the official source named in each market's rules and clears them through its registered clearinghouse.\n\nResolution clarity matters for the price too. Markets with clean, verifiable criteria converge smoothly, while markets with vague or contestable rules can see volume dry up and spreads widen even as the real-world uncertainty shrinks, because traders fear a disputed or surprising settlement.",
      },
      {
        heading: 'Arbitrage keeps platforms roughly in line',
        body: "The same question often trades on more than one venue, and arbitrage is the force that keeps those prices from drifting far apart. If a YES contract is cheap on one platform and the matching NO is cheap on another, a trader can buy both, lock in a position that pays out regardless of the outcome, and pocket the difference if the combined cost is below the payout after fees. That buying pressure pushes the two prices back toward each other.\n\nIn practice these gaps are usually small and close fast, often within seconds, and much of the activity is run by bots watching many markets at once. Prices for the same event still diverge sometimes, especially for politically charged questions where the two platforms' user bases differ, or where fees, settlement timing, and the exact resolution wording are not identical. Those frictions are exactly why a perfectly riskless gap is rare and why small differences can persist.\n\nFor a reader, the lesson is comparative: when two reputable markets agree on a question, that is a stronger signal than either alone; when they disagree, it is usually a clue that the wording differs, the liquidity is thin, or the crowds genuinely see the question differently. As always, specifics go stale, so check a live market for the current price rather than relying on any number quoted here.",
      },
    ],
    faq: [
      {
        q: 'What causes prediction-market odds to change?',
        a: 'Odds change when participants trade on new information, so the main drivers are news, data releases, polls, earnings, official statements, and similar developments. Order flow and liquidity determine how far a given trade moves the price, and large or informed traders can shift it more. Prices also tend to settle toward 0 or 100 cents as a market nears its resolution date.',
      },
      {
        q: 'Do prediction-market prices show the real probability?',
        a: "They show the crowd's money-weighted estimate of the probability, not a certified true probability. A price of 70 cents implies roughly a 70 percent chance in the market's collective view. These estimates are often reasonably accurate because traders back beliefs with capital, but they can be wrong, especially in thin markets or when the crowd is collectively mistaken.",
      },
      {
        q: 'Why do prediction markets move before the news is confirmed?',
        a: 'Because the price is a live forecast, not a record of confirmed events. A participant who hears an early report, or who holds information others lack, can trade immediately and move the price ahead of official confirmation. This makes markets fast but also jumpy, since an early signal can move the price and a later correction can move it back.',
      },
      {
        q: 'Why do the same odds differ between Polymarket and Kalshi?',
        a: 'The platforms have different user bases, fee structures, settlement timing, and resolution wording, so prices for the same event can diverge. Arbitrage traders usually push the prices close together within seconds, but gaps persist for politically charged questions or thinly traded markets. A difference often signals that the exact resolution criteria are not identical or that liquidity is low.',
      },
      {
        q: 'What does it mean when a prediction market price is near 99 cents?',
        a: 'A price near 99 cents means the market is nearly certain the outcome will happen, usually because the event is close to resolving and little uncertainty remains. As resolution approaches, prices converge toward 0 or 100 cents and become harder to move. It is still an estimate, not a settled fact, and the official resolution source has the final say.',
      },
    ],
    relatedTopics: ['Politics', 'Economics', 'Finance', 'Crypto'],
  },
  {
    slug: 'how-prediction-markets-resolve',
    title: 'How Prediction Markets Resolve and Settle: Kalshi, Polymarket and UMA',
    h1: 'How prediction markets resolve and settle',
    metaDescription:
      'How prediction markets resolve: winning shares pay $1, losers $0. How Kalshi settles under CFTC rules and how Polymarket uses the UMA optimistic oracle.',
    intro:
      'A prediction market is a contract that pays out based on a real-world outcome, so the moment that decides who gets paid is the resolution. This page explains how that works: the settlement math where each winning share pays $1 and each losing share pays $0, where the "truth" of an outcome comes from, and how the two largest venues differ. Kalshi resolves through its own rules and named source agencies under U.S. derivatives regulation, while Polymarket resolves on-chain through the UMA optimistic oracle with a public dispute window. We also cover what happens when an outcome is ambiguous or contested, why those cases have drawn scrutiny, and why the single most useful habit a reader can build is checking a specific market\'s rules before trusting its price. None of this is financial advice; market prices are crowd-implied probabilities that can be, and sometimes are, wrong.',
    sections: [
      {
        heading: 'The settlement mechanism: $1 for a winning share, $0 for a loser',
        body: 'Most prediction-market contracts are binary. A question is framed as a yes/no proposition, and a share in the correct outcome settles at $1 while a share in the wrong outcome settles at $0. That fixed payout is what lets the price read as a probability: a contract trading around $0.63 implies the crowd is putting roughly a 63% chance on that outcome happening, because $0.63 is what a $1 payoff is worth if it pays off about 63% of the time.\n\nPayout is not the same as profit. The $1 settlement is fixed by the contract; the profit depends on the price paid to get in. Buying a share at $0.62 that later settles at $1 returns a $0.38 gain per share before fees, while the same share settles at $0 and is a total loss if the other outcome occurs. Some markets are multi-outcome (for example, several candidates in one race), but they are typically built from the same logic: exactly one outcome resolves to $1 and the rest to $0.\n\nThe price moving toward $1 or $0 before an event is decided does not mean the question has resolved. Settlement happens only when the resolution criteria are met and the outcome is confirmed against the designated source. Until then, a price near $0.95 reflects high crowd confidence, not a finished result, and confidence can still be misplaced.',
      },
      {
        heading: 'Where the answer comes from: resolution sources and rules',
        body: 'Every market resolves against a defined source of truth, and the quality of that definition matters more than the headline question. Well-written contracts name exactly what will be consulted: an official result (an election authority certifying a winner, a sports league\'s final score), a designated source agency (a government statistics office, a regulator, a court record), or a specific named data feed (an economic data release, a published price index). The rules also specify the exact date, time, and condition that count, and what happens in edge cases such as a postponement, a tie, or a cancelled event.\n\nThis is why two markets that look like they ask the same thing can settle differently. The truth conditions live in the rules, not the title. A market that resolves on "officially announced by [a named body] by [a named date]" can pay out differently from one that resolves on "reported by major news outlets," even when both are nominally about the same event. Wording around timing, sourcing, and what qualifies as the triggering event is where most genuine disputes begin.\n\nFor a reader, the practical takeaway is that the resolution source and rule are the contract. Crowdtells reads markets as a signal of what people think will happen and what matters, but the number only means what the rules say it means. Before treating a price as informative, it is worth knowing which source decides it.',
      },
      {
        heading: 'How Kalshi resolves: exchange rules and source agencies under CFTC oversight',
        body: "Kalshi is a CFTC-regulated derivatives venue. It operates as a Designated Contract Market (DCM), a category of exchange overseen by the U.S. Commodity Futures Trading Commission, which has regulated U.S. derivatives markets since 1974. Within that framework, Kalshi lists event contracts and self-certifies their terms with the regulator, meaning the contract specifications, including how each one resolves, are filed rather than improvised after the fact.\n\nResolution on Kalshi is centralized. Each contract's terms reference the source agency or underlying data whose value at the stated expiration determines the outcome, and Kalshi's market operations team confirms settlement once the criteria are met. Traders can flag a market they believe is ready to settle, but that flag is a prompt, not a binding instruction; the exchange controls the final determination. Kalshi's rulebook also provides for a market outcome review process the exchange can invoke before settling in cases that need closer examination.\n\nThe trade-off is straightforward. A single accountable operator under regulatory supervision can resolve quickly and apply consistent, pre-filed rules, but it also concentrates the resolution decision in one party. That has not made Kalshi immune from controversy; specific settlements have drawn user complaints when the contract wording and the messy real world did not line up cleanly, which is the same ambiguity problem every venue faces.",
      },
      {
        heading: 'How Polymarket resolves: the UMA optimistic oracle and the dispute window',
        body: "Polymarket settles on-chain and outsources the \"what actually happened\" question to the UMA optimistic oracle, a decentralized, permissionless system. The word optimistic captures the design: once a market's event window closes, anyone can propose the outcome by posting a bond (commonly around $750), and that proposed answer is assumed correct unless someone challenges it. There is a short challenge or liveness window, typically about two hours, during which any participant can dispute the proposal by posting a matching bond.\n\nIf no one disputes within the window, the market resolves to the proposed outcome, the proposer recovers the bond plus a small reward, and winning shares become redeemable for $1 each while losing shares go to $0. If the proposal is disputed, it escalates to UMA's Data Verification Mechanism (DVM), where UMA token holders vote on the correct outcome over a period that runs into days. The side the vote agrees with recovers its bond and is rewarded from the loser's forfeited bond, which is the economic incentive meant to keep honest answers cheap to defend and bad answers expensive to push.\n\nThe strength of this model is that it is open and adversarial: anyone can contest a wrong answer rather than relying on one operator. The weakness is that final say in a contested case rests with token-holder voting rather than a named official source, and the outcome turns heavily on how the market's rules were written. Specific bond sizes, window lengths, and timings can change, so the current parameters should be read from the live market and UMA's documentation rather than memorized.",
      },
      {
        heading: 'When resolution is contested, and why the rules page is the thing to read',
        body: "Most markets resolve uneventfully. The hard cases are the ones where reality does not map cleanly onto the contract: an event partly happens, an official source is slow or silent, a key word in the rules is read two ways, or the triggering condition is arguable. In those situations the resolution mechanism, centralized review on Kalshi, or proposal-and-dispute on Polymarket, becomes the whole story, and the eventual payout can hinge on a single clause.\n\nContested resolutions have drawn real scrutiny. High-value markets on geopolitical and financial questions have entered formal disputes, a notable case in 2026 centered on how a market about a corporate Bitcoin sale should resolve, and the broader pattern of disputed and unclear outcomes has attracted attention from commentators and at least one U.S. senator. The recurring theme is not fraud so much as ambiguity: when wording leaves room, participants with opposite positions can each believe they are right. These specifics will keep changing, so treat any particular case as illustrative rather than definitive and check a live source.\n\nThe defensive habit is simple and applies to every venue. Before you trust a price, read the market's own resolution rules: what the exact question is, which source decides it, by what date and time, and how postponements, ties, or cancellations are handled. A price is only as trustworthy as the rule behind it. Crowdtells treats these markets as a money-weighted probability estimate of what may happen, useful as a signal, not a guarantee, and nothing here is financial advice.",
      },
    ],
    faq: [
      {
        q: 'How do prediction markets pay out?',
        a: 'Most prediction-market contracts are binary, so each share in the correct outcome settles at $1 and each share in the incorrect outcome settles at $0. Your profit is the difference between $1 and the price you paid, minus any fees. Payout happens after the market resolves against its designated source, not when the price simply moves close to $1.',
      },
      {
        q: 'How does Kalshi resolve and settle its markets?',
        a: "Kalshi is a CFTC-regulated Designated Contract Market, and its event contracts are self-certified with the regulator, including the rules for how each one resolves. Settlement is centralized: each contract names the source agency or data whose value at expiration decides the outcome, and Kalshi's operations team confirms the result once the criteria are met. The exchange can also run a market outcome review before settling in cases that need closer examination.",
      },
      {
        q: 'How does Polymarket resolve markets with UMA?',
        a: 'Polymarket uses the UMA optimistic oracle. After an event window closes, someone proposes the outcome by posting a bond, and that answer stands unless it is disputed within a short challenge window (often about two hours). If it is disputed, the question escalates to a vote by UMA token holders, who decide the final outcome, after which winning shares redeem for $1 and losing shares for $0.',
      },
      {
        q: 'What happens if a prediction market outcome is disputed?',
        a: "On Polymarket, a disputed proposal escalates to UMA's token-holder vote (the DVM), where the side the vote agrees with is rewarded and the losing side forfeits its bond. On Kalshi, the exchange can invoke a market outcome review and makes the final determination under its filed rules. Contested cases usually trace back to ambiguous wording or an unclear real-world result, and several high-value disputes have drawn public scrutiny.",
      },
      {
        q: "Why should I read a prediction market's rules before trading?",
        a: 'Because the rules, not the title, define the outcome. Two markets that look identical can settle differently depending on which source decides them, the exact date and time that count, and how ties, postponements, or cancellations are handled. Reading the resolution rules tells you what a price actually means and where it could turn against you. None of this is financial advice.',
      },
    ],
    relatedTopics: ['Finance', 'Economics', 'Crypto', 'Politics'],
  },
  {
    slug: 'how-to-check-nyc-dob-hpd-violations',
    title: 'How to Check NYC Building Violations by Address',
    h1: 'How to Check NYC Building Violations by Address',
    metaDescription:
      'A free how-to for checking NYC building violations by address — search DOB and HPD records, decode violation classes 1/2/3 and A/B/C, and why they matter.',
    intro:
      'Every building in New York City carries a public record of its open violations, and you can read most of it for free without a lawyer or an inspector. City agencies log problems by address: the Department of Buildings tracks structural and code issues, while the Department of Housing Preservation and Development handles residential conditions. Knowing where those records live, and what the violation classes mean, helps owners, renters, buyers, and lenders judge a property before a problem becomes expensive.',
    sections: [
      {
        heading: 'Where NYC violation records actually live',
        body: 'New York City spreads its property records across several agencies, so a full picture usually means checking more than one system. The Department of Buildings, or DOB, keeps construction and code data in two places: the older Buildings Information System (BIS) and the newer DOB NOW portal, which handles most current filings and permits. Both let you search by address at no cost.\n\nResidential conditions sit with a separate agency. The Department of Housing Preservation and Development, or HPD, records apartment-related violations — heat, hot water, leaks, pests, and similar issues — in its HPD Online system, also free and searchable by address.\n\nA third stream comes from summonses. Many agency violations are written as tickets adjudicated at the Office of Administrative Trials and Hearings (OATH), the tribunal that hears what were long called Environmental Control Board, or ECB, cases. Because the data is scattered, some free tools pull all three together; a [combined DOB, HPD, and ECB lookup by address](https://regwatch.nyc/nyc-violation-lookup) returns records from each system in one search.',
      },
      {
        heading: 'How to search a building, step by step',
        body: "You can start with the address itself. Find the building's borough, block, and lot — its BBL, the unique parcel identifier the city assigns to every lot — or simply enter the street address in the agency portal you need. DOB BIS and DOB NOW both accept an address and return the property's filings, permits, and violations.\n\nFor residential complaints, run the same address through HPD Online, which lists violations by apartment and class. To see summonses and unpaid fines, check the OATH hearings database, where each ticket shows its status, penalty, and whether a decision has been entered.\n\nRead the status field carefully. A violation may be open, meaning unresolved; closed or dismissed; or resolved with the city but still carrying an unpaid penalty. Open items and unpaid balances are the ones that follow a property forward.",
      },
      {
        heading: 'What DOB violation classes mean',
        body: 'The DOB sorts its violations into three classes by severity. Class 1 is Immediately Hazardous — the most serious, covering conditions that pose a direct danger, such as illegal construction or a structural risk. Class 2 is Major, and Class 3 is Minor, covering lesser, non-hazardous issues that are typically corrected once the owner is notified.\n\nThe class drives the potential penalty. A Class 1 violation can carry up to $25,000 per violation, and a Class 2 up to $10,000 per violation. Class 3 items are lower-stakes but still need to be cleared, because an open record can complicate a sale or a permit down the line.',
      },
      {
        heading: 'What HPD violation classes mean',
        body: "Residential violations from HPD use a different scale, lettered A through C. Class A is non-hazardous — minor upkeep issues that must be corrected but carry no immediate danger, generally within about 90 days. Class B is hazardous, and Class C is immediately hazardous, such as no heat or hot water in cold weather, which the city expects to be cured fastest.\n\nOwners clear an HPD violation by fixing the condition and then certifying the correction through HPD Online, usually with photo evidence that the work was done. Until that certification is accepted, the violation stays on the building's record even if the repair is finished.",
      },
      {
        heading: 'ECB summonses, OATH, and how fines become liens',
        body: 'An ECB violation is a summons — a ticket issued by an agency such as DOB, the Fire Department, the Sanitation Department, DEP, or HPD — and heard at OATH. Penalties commonly range from $250 to $25,000 per summons, depending on the offense and the agency.\n\nTiming matters. If you do not request a hearing within 30 days, the tribunal can enter a default judgment against you, often at a higher penalty than the original ticket. An unpaid judgment can then be docketed as a judgment lien against the property itself — not just the owner — which means it attaches to the building and generally must be cleared before a sale closes.',
      },
      {
        heading: 'Why open violations matter for deals, financing, and insurance',
        body: "Open violations are not just paperwork. In a sale, a title search will surface docketed liens and unpaid fines, and buyers routinely ask that they be cleared before closing. In a refinance, a lender may treat serious open items — especially Immediately Hazardous ones — as a condition to resolve before approving the loan.\n\nInsurers can factor a building's violation history into coverage and pricing, and a pattern of unresolved hazards can raise questions about risk. For any specific situation, this is general information rather than legal advice; verify the details with the relevant city agency or a qualified professional before acting.",
      },
    ],
    faq: [
      {
        q: 'How do I check NYC building violations for free?',
        a: "You can search each city system by address at no cost: DOB's Buildings Information System (BIS) and DOB NOW for construction and code violations, HPD Online for residential conditions, and the OATH hearings database for summonses. Because the records are split across agencies, some free tools combine them into a single address search. None of it requires a paid account.",
      },
      {
        q: 'What is the difference between DOB Class 1, 2, and 3 violations?',
        a: 'The class marks severity. Class 1 is Immediately Hazardous and the most serious, Class 2 is Major, and Class 3 is Minor and non-hazardous. Penalties scale with the class — up to $25,000 per Class 1 violation and up to $10,000 per Class 2 — while Class 3 items are lower-stakes but still need to be cleared.',
      },
      {
        q: 'What do HPD Class A, B, and C violations mean?',
        a: 'HPD uses letters for residential conditions. Class A is non-hazardous and must be corrected, generally within about 90 days; Class B is hazardous; and Class C is immediately hazardous, such as a lack of heat or hot water, which must be cured fastest. Owners certify the fix through HPD Online, usually with photo evidence.',
      },
      {
        q: 'Can an unpaid NYC violation become a lien on the property?',
        a: 'Yes. An ECB summons heard at OATH carries a penalty commonly between $250 and $25,000, and if you miss the 30-day window to request a hearing, a default judgment can be entered. An unpaid judgment can be docketed as a lien against the property itself, which typically must be cleared before a sale closes.',
      },
      {
        q: 'Why do building violations matter when buying or refinancing?',
        a: "Open violations and unpaid fines show up in title searches and can stall a deal until they are resolved. Lenders may require serious items to be cleared before approving a refinance, and insurers can weigh a building's history in coverage and pricing. This is general information, not legal advice — confirm specifics with the relevant agency or a professional.",
      },
    ],
  },
  {
    slug: 'nyc-title-deed-lien-search-guide',
    title: 'NYC Title, Deed & Lien Search: The ACRIS Guide',
    h1: 'NYC Title, Deed and Lien Search: An ACRIS Guide',
    metaDescription:
      "Run an NYC title, deed and lien search through ACRIS, the city's public record. See what deeds, mortgages and liens reveal and what clears at closing.",
    intro:
      'Before you buy, refinance, or research a New York City property, much of its legal history is already public. The city records deeds, mortgages, and liens in ACRIS, an online database anyone can search. Reading those documents tells you who owns a property, what it owes, and what claims are attached to it. This guide explains what each record means, how a title search differs from a formal title report, and where a pre-purchase reader should look.',
    sections: [
      {
        heading: "ACRIS: New York City's system of record",
        body: "ACRIS, the Automated City Register Information System, is New York City's official record of property documents. The Department of Finance maintains it, and it is the primary source for recorded deeds, mortgages, and liens. The system covers documents from 1966 to the present.\n\nBecause these records are public, you do not need to own a property, or hire anyone, to read its filed history. You can search by address, by a parcel's borough-block-lot number (the BBL, the city's unique tax identifier for a piece of land), or by the name of a party to a document.\n\nWhat ACRIS shows is the paper trail: the documents themselves, the dates they were recorded, and the parties named on them. It does not interpret them for you, which is why knowing what each record type means matters.",
      },
      {
        heading: 'Deed, mortgage, lien: what each document tells you',
        body: 'A deed is the document that transfers ownership from one party to another. Reading the chain of deeds, meaning each recorded transfer over time, shows you who currently holds title (the legal ownership of the property) and how ownership has changed hands. The most recent deed names the current owner of record.\n\nA mortgage is a loan secured by the property. A recorded mortgage tells you the property was pledged as collateral for a debt; a later satisfaction, or release, indicates that debt was paid off. An open mortgage that was never satisfied on paper can raise a question a closing needs to resolve.\n\nA lien is a legal claim against the property for money owed. It can arise from unpaid property taxes, water and sewer charges, certain municipal debts, or unpaid judgments. A lien travels with the property, not just the person who incurred it, so it becomes the concern of whoever owns the parcel next.',
      },
      {
        heading: 'A title search versus a formal title report',
        body: "A title search is the act of reading the public record to reconstruct a property's history: who has owned it, what is borrowed against it, and what claims are outstanding. You can do a basic version yourself through ACRIS, and it is a reasonable first pass before making an offer or ordering deeper work.\n\nA formal title report, sometimes called a title abstract, is a different thing. It is a professional examination prepared by a title company that compiles the chain of title, flags defects and exceptions, and underpins title insurance at closing. It carries legal weight and financial backing that a self-serve search does not.\n\nPut simply, a public-record search tells you what is filed; a title report certifies what it means and stands behind it. The first is useful for orientation and due diligence; the second is what lenders and buyers rely on to actually close.",
      },
      {
        heading: 'How liens attach to the property, and clear at closing',
        body: "Two kinds of lien come up often in New York City. A tax lien is a claim for unpaid property taxes, water or sewer charges, or certain municipal debts. Left unpaid, these can be enforced against the property itself.\n\nThe second kind is a docketed judgment lien. When a fine goes unpaid, for example an unpaid Environmental Control Board (ECB) summons adjudicated at the city's Office of Administrative Trials and Hearings (OATH), it can be entered, or docketed, as a judgment lien against the property rather than only against the owner. Once docketed, it attaches to the parcel and appears on title searches.\n\nBoth kinds generally must be cleared at closing: the debt is paid, or otherwise resolved, so that title passes clean to the buyer. This is why open liens found in the public record matter well before a sale, since they can hold up a deal or reduce what a seller nets. You can screen a parcel for recorded claims with an [NYC lien search by address](https://regwatch.nyc/nyc-lien-search), then verify anything you find against the agency of record.",
      },
      {
        heading: "How to look up a property's chain of title and open liens",
        body: "You can start directly at ACRIS. Search by address or by BBL, and it returns the documents recorded against that parcel. Sort by document type and date to rebuild the timeline: deeds show ownership transfers, mortgages show borrowing, and satisfactions show debts marked paid.\n\nRead the most recent deed first to confirm the current owner of record, then work backward through earlier deeds to see the chain of title. For debts, note any mortgage without a matching satisfaction and any recorded lien, judgment, or lis pendens (a recorded notice that litigation affecting the property is pending).\n\nIf you would rather see a parcel's ownership and document history compiled in one view, a consolidated [NYC title and deed history pulled from ACRIS](https://regwatch.nyc/nyc-title-search) can save time. Treat any such summary as a starting point, and confirm the underlying documents in ACRIS itself before relying on them.",
      },
      {
        heading: 'Where the public record stops',
        body: "The public record is strong on documents that were filed, but it is not a guarantee of clean title. Some claims are not recorded in ACRIS, filings can contain errors, and a document's legal effect is not always obvious from its face.\n\nThat is why a self-serve search is due diligence, not a substitute for the professionals who close a deal. A title company and a real estate attorney examine the record, resolve defects, and back their work; a title search you run yourself does none of those things.\n\nThis guide is general information, not legal advice. For anything that affects a purchase, refinance, or dispute, verify specifics with the relevant city agency and have a title company or attorney review the record before you rely on it.",
      },
    ],
    faq: [
      {
        q: 'Is an ACRIS deed search free?',
        a: 'Yes. ACRIS is a public database maintained by the Department of Finance, and searching recorded deeds, mortgages, and liens costs nothing. You can look up documents by address, by borough-block-lot (BBL) number, or by party name. Copies of some documents may carry a small fee, but the search itself is free.',
      },
      {
        q: 'How far back does ACRIS go?',
        a: 'ACRIS covers recorded property documents from 1966 to the present. Transactions before 1966 are generally held on older systems and are not part of the online database. For a full historical chain of title, a title company can search beyond what ACRIS shows.',
      },
      {
        q: 'Do liens stay with the property or the owner?',
        a: 'Many liens attach to the property itself, not only the person who incurred them. Tax liens and docketed judgment liens, including unpaid ECB fines entered against a parcel, travel with the property and typically must be cleared at closing. That is why a buyer, not just a seller, has a stake in resolving them.',
      },
      {
        q: 'Can I run my own NYC title search instead of hiring a title company?',
        a: "You can read the public record yourself through ACRIS to see ownership, mortgages, and recorded liens, which is useful for early research. It is not a substitute for a formal, insured title report. Lenders and closings rely on a title company's examination and title insurance, which a self-serve search does not provide.",
      },
      {
        q: 'What is the difference between a deed and a title?',
        a: 'Title is the legal right of ownership of a property; a deed is the document that transfers that title from one party to another. You cannot search for title as a single filing, so you read the chain of recorded deeds to establish who holds title today. The most recent deed names the current owner of record.',
      },
    ],
  },
  {
    slug: 'nyc-local-law-97-compliance',
    title: "Local Law 97 Compliance in NYC: A 2026 Owner's Guide",
    h1: "Local Law 97 Compliance in NYC: The 2026 Owner's Guide",
    metaDescription:
      "Local Law 97 sets carbon caps on NYC buildings over 25,000 sq ft. See who's covered, how the $268-per-ton penalty works, and the May 1 filing deadline.",
    intro:
      'Local Law 97 is a New York City rule that sets carbon limits on large buildings, and 2026 is the first year owners are living with it in full force. Passed as part of the Climate Mobilization Act, the law caps emissions from most large properties and fines those that run over. The first compliance period is already underway, the first reports have come due, and penalties now attach to real emissions. This guide explains who is covered, how the penalty math works, the reporting deadline, and what owners should check.',
    sections: [
      {
        heading: 'What Local Law 97 is, and why the city passed it',
        body: "Local Law 97, codified at NYC Admin Code § 28-320, is the centerpiece of the Climate Mobilization Act, a package the City Council adopted as Local Law 97 of 2019. Its purpose is to cut greenhouse-gas emissions from large buildings, which are among the city's biggest sources of carbon.\n\nThe mechanism is a cap-and-penalty system. Each covered building is assigned an annual emissions limit based on its size and use, and an owner who exceeds that limit pays a fine tied to how far over the building runs. The caps are designed to tighten over time, so a building that complies today may not comply later without changes.\n\nThis is general information, not legal or engineering advice. The rules carry technical definitions and exceptions, so confirm your building's status with the Department of Buildings or a qualified professional.",
      },
      {
        heading: 'Which buildings are covered',
        body: "The core threshold is size. Local Law 97 generally applies to buildings over 25,000 gross square feet. It also reaches two or more buildings on the same tax lot that together exceed 50,000 square feet, capturing campus-style arrangements that a single-building test would miss.\n\nCoverage is not uniform. Certain rent-regulated buildings and several other property types follow separate compliance pathways with different requirements, so being over the size threshold does not automatically mean the standard caps apply in the standard way.\n\nBecause the lines turn on gross floor area, tax-lot configuration, and building use, an owner who is unsure should confirm coverage rather than assume it. You can look up a building's size and use characteristics and [check whether a specific address falls under Local Law 97](https://regwatch.nyc/ll97-compliance) before drawing conclusions.",
      },
      {
        heading: 'The caps and how the penalty math works',
        body: 'Local Law 97 phases in through compliance periods. The first period runs 2024 through 2029 and, for many buildings, requires roughly a 40 percent cut from a 2005 baseline. Stricter limits take effect January 1, 2030, opening the tougher 2030 through 2034 period.\n\nThe penalty for exceeding a cap is $268 for every metric ton of carbon-dioxide-equivalent (CO2e) over the limit, assessed each year. The math scales linearly: a building about 10 tons over its cap would owe roughly $2,680 a year, while one about 500 tCO2e over would owe roughly $134,000 a year.\n\nBecause the fine is annual and the caps drop in 2030, a building that is comfortably under today can face exposure later. A [Local Law 97 penalty calculator](https://regwatch.nyc/tools/ll97-calculator) can translate a projected overage into an estimated annual dollar figure.',
      },
      {
        heading: 'Reporting: the annual May 1 deadline',
        body: "Compliance is proven through a report, not just by staying under the cap. Covered owners must file an annual emissions report through DOB NOW, the Department of Buildings' online portal, due May 1 each year for the prior calendar year.\n\nThe timing matters in 2026 because the program is no longer theoretical. Penalties apply to 2024 emissions, and the first reports were due May 1, 2025. The first full cycle of filings and any resulting penalties are already behind us, and the next report follows the same May 1 schedule.\n\nMissing or misfiling the report is its own risk, separate from the emissions cap itself. Owners who have not yet filed for a covered building should treat the deadline as a live obligation and confirm their standing with the Department of Buildings.",
      },
      {
        heading: 'What owners, managers, and buyers should do now',
        body: "Start by confirming coverage and pulling the building's baseline: gross square footage, use type, and energy consumption. Those inputs determine the applicable cap and whether the standard pathway or a separate one applies.\n\nOne lever built into the law is renewable energy credits. Owners may offset up to 50 percent of a building's electricity emissions by purchasing RECs, which can narrow or close a gap without physical retrofits, though it does not address emissions from on-site fuel such as gas heat.\n\nBuyers should treat Local Law 97 exposure as part of diligence, since the obligation runs with the building. Reviewing projected caps, recent DOB NOW filings, and any accrued penalties before closing can reveal a recurring annual cost that outlasts the current owner. As always, this is general information, not legal advice; verify specifics with the relevant city agency or a professional.",
      },
    ],
    faq: [
      {
        q: 'Which buildings does Local Law 97 apply to?',
        a: "Local Law 97 generally covers buildings over 25,000 gross square feet, plus two or more buildings on the same tax lot that together exceed 50,000 square feet. Some rent-regulated buildings and other property types follow separate compliance pathways. If you are unsure, confirm your building's status with the Department of Buildings rather than assuming.",
      },
      {
        q: 'How much are Local Law 97 penalties?',
        a: 'The penalty for exceeding your emissions cap is $268 per metric ton of CO2-equivalent over the limit, assessed annually. As a rough scale, about 10 tons over is roughly $2,680 a year, and about 500 tons over is roughly $134,000 a year. Because it is charged every year, a persistent overage becomes a recurring cost.',
      },
      {
        q: 'When is the Local Law 97 reporting deadline?',
        a: 'Covered owners file an annual emissions report through the DOB NOW portal, due May 1 each year for the prior calendar year. Penalties apply to 2024 emissions, and the first reports were due May 1, 2025. The report is a separate obligation from staying under the cap, and missing it carries its own risk.',
      },
      {
        q: 'Can renewable energy credits reduce Local Law 97 compliance costs?',
        a: "Yes, within limits. Owners may offset up to 50 percent of a building's electricity emissions by buying renewable energy credits, known as RECs. This can help close a gap without physical upgrades, but it does not offset emissions from on-site fuel such as gas heating.",
      },
      {
        q: 'Do the Local Law 97 caps get stricter over time?',
        a: 'Yes. The first compliance period runs 2024 through 2029 and, for many buildings, requires roughly a 40 percent cut from a 2005 baseline. Tighter limits begin January 1, 2030 for the 2030 through 2034 period, so a building that complies today may exceed its cap later without changes.',
      },
    ],
  },
  {
    slug: 'nyc-facade-inspection-fisp-local-law-11',
    title: 'NYC Facade Inspection: FISP / Local Law 11 Explained',
    h1: 'NYC Facade Inspection: FISP and Local Law 11 Explained',
    metaDescription:
      'FISP, or Local Law 11, requires NYC buildings taller than six stories to have their facades inspected every five years. Cycle 10 windows, ratings, and fines.',
    intro:
      "Every few years, scaffolding and sidewalk sheds appear around New York City's taller buildings. Much of that work traces back to one rule: the Facade Inspection Safety Program, better known by its original name, Local Law 11. It requires owners of buildings taller than six stories to have a qualified inspector examine the exterior walls on a fixed five-year schedule and file a report with the city. This explainer covers who must comply, the current inspection cycle, the ratings, and the penalties for missing a deadline.",
    sections: [
      {
        heading: 'What FISP and Local Law 11 require',
        body: "FISP stands for the Facade Inspection Safety Program. It is set out in New York City Administrative Code § 28-302 and traces back to Local Law 11 of 1998, which is why many owners and contractors still refer to it simply as Local Law 11.\n\nThe rule applies to buildings taller than six stories. Height, not use, is what triggers coverage, so residential, commercial, and mixed-use buildings above that threshold are all included. The term exterior walls covers the facade and its attached parts, such as cornices, balconies, and window guards.\n\nBecause the requirement turns on details of a building's construction and address, it helps to read the underlying rule directly, which is available on a [detail page for Local Law 11](https://regwatch.nyc/regulations/nyc-dob-ll11) that reproduces the § 28-302 provisions.",
      },
      {
        heading: 'The five-year cycle and the QEWI',
        body: "Under FISP, the inspection is not a one-time event. Every five years, the owner of a covered building must retain a Qualified Exterior Wall Inspector, or QEWI. A QEWI is a licensed professional engineer or registered architect who meets the Department of Buildings' experience criteria for this work.\n\nThe QEWI examines the exterior walls, including a close, hands-on look at representative sections rather than only a view from the ground. The inspector then files a technical report with the Department of Buildings that assigns the facade a formal condition.\n\nThe QEWI also oversees any required repairs and, where conditions are serious, the protective measures that go up while the work is scheduled. The report must be filed within the building's assigned window, described below.",
      },
      {
        heading: 'Safe, SWARMP, and Unsafe',
        body: 'Each FISP report places the facade in one of three categories. Safe means the inspector found no conditions that require repair before the next cycle.\n\nSWARMP stands for Safe With a Repair and Maintenance Program. It describes a facade that is safe today but has conditions that will become unsafe if they are not corrected on a set schedule. The owner is expected to fix those conditions before the next inspection, and SWARMP items left unaddressed can carry a penalty of up to $1,000 per year.\n\nUnsafe is the most serious rating. It means the facade has conditions that pose a present hazard to the public. The owner must put up public-protection measures, such as a sidewalk shed, promptly, complete the repairs, and have the QEWI re-inspect and file an amended report.',
      },
      {
        heading: 'Cycle 10 and its staggered deadlines',
        body: "FISP runs in numbered five-year cycles. The current one is Cycle 10, which runs from February 21, 2025 to February 21, 2030. Every covered building must file one report during that window.\n\nThe deadlines are staggered so that filings do not all land at once. A building's specific filing window is set by the last digit of its block number, the tax-map identifier the city assigns to the parcel of land a building sits on. Buildings are sorted into sub-windows within the larger cycle based on that digit.\n\nBecause the schedule is fixed years in advance, owners can line up a QEWI and budget for any repairs well before their window opens. Filing late, or not at all, is what triggers the failure-to-file penalties covered next.",
      },
      {
        heading: 'Penalties, sidewalk sheds, and liability',
        body: 'Failure to file a required FISP report carries a penalty of $1,000 or more per month, and that amount rises for continuing violations. As noted above, unaddressed SWARMP conditions can carry a separate penalty of up to $1,000 per year.\n\nThe costs are not only financial. When a facade is rated unsafe, or when repairs are delayed, a sidewalk shed usually stays in place until the work is finished, which can mean months or years of scaffolding and added expense. The program exists chiefly for public safety, since loose masonry and failing anchors can fall onto sidewalks below.\n\nThere is also liability to weigh: an owner who leaves a known hazardous condition unrepaired can face significant exposure if someone is hurt. This is general information, not engineering or legal advice, and owners should confirm their obligations with the Department of Buildings or a licensed professional.',
      },
      {
        heading: "How to find your building's deadline and status",
        body: "Start with two facts about your building: its height and its block number. If the building is taller than six stories, FISP applies. You can look up the block number on your property tax bill or the city's public property records, and its last digit points to your Cycle 10 sub-window.\n\nTo see whether prior FISP reports were filed and how the facade was rated, you can search the Department of Buildings' online records by address, which list past filings and their status.\n\nIf you would rather view your FISP date next to a building's other recurring obligations, a [calendar of NYC compliance deadlines](https://regwatch.nyc/nyc-compliance-deadlines) gathers them in one place. Treat any date you find as a starting point, and confirm the exact deadline with the Department of Buildings or your QEWI.",
      },
    ],
    faq: [
      {
        q: 'What is FISP, and how is it related to Local Law 11?',
        a: "FISP is the Facade Inspection Safety Program, New York City's rule requiring periodic inspection of building facades. It is codified in Administrative Code § 28-302 and originated with Local Law 11 of 1998, so the two names refer to the same program. Owners of covered buildings must file inspection reports on a recurring schedule.",
      },
      {
        q: 'Which NYC buildings must comply with FISP?',
        a: 'FISP applies to buildings taller than six stories. Coverage is based on height rather than how the building is used, so qualifying residential, commercial, and mixed-use buildings are all included. Owners of these buildings must have a qualified inspector examine the exterior walls every five years.',
      },
      {
        q: 'What does a SWARMP rating mean?',
        a: 'SWARMP stands for Safe With a Repair and Maintenance Program. It means the facade is safe now but has conditions that will become unsafe if they are not repaired on a schedule. Owners must correct SWARMP conditions before the next cycle, and leaving them unaddressed can carry a penalty of up to $1,000 per year.',
      },
      {
        q: 'When is the FISP Cycle 10 deadline?',
        a: "Cycle 10 runs from February 21, 2025 to February 21, 2030. Every covered building must file one inspection report during that period, but the exact window is staggered by the last digit of the building's block number. That means two buildings can have different Cycle 10 deadlines within the same five-year span.",
      },
      {
        q: 'What is the penalty for not filing a FISP report?',
        a: 'Failing to file a required FISP report carries a penalty of $1,000 or more per month, which increases for continuing violations. Unaddressed SWARMP conditions can carry a separate penalty of up to $1,000 per year. Beyond fines, an unsafe facade often requires a sidewalk shed to remain up until repairs are complete.',
      },
    ],
  },
  {
    slug: 'best-ways-to-check-nyc-property-records',
    title: 'Best Ways to Check NYC Property Records',
    h1: 'The Best Ways to Check NYC Property Records',
    metaDescription:
      'A fair, plain-English guide to how to check NYC property records — free official systems, paid pro platforms, and all-in-one aggregators, and how to choose.',
    intro:
      'Researching a New York City property means piecing together its paper trail: who owns it, what is filed against it, and whether it carries open violations or liens. The city publishes most of this for free, but across several separate systems. Paid platforms and all-in-one aggregators promise to stitch it together for you. This guide walks through the main options, what each does well, and how to match the tool to your need.',
    sections: [
      {
        heading: 'Start with the free official systems',
        body: "New York City runs the authoritative records itself, at no cost. ACRIS, the Automated City Register Information System, is the official record for recorded documents — deeds, mortgages, and liens. It is the source of truth for ownership and title history, though its interface is dated and records-only.\n\nFor buildings, the Department of Buildings holds permits, inspections, and violations. Newer filings live in DOB NOW, while older records remain in the read-only BIS archive. HPD Online, run by the Department of Housing Preservation and Development, covers residential housing-code violations, complaints, and registrations.\n\nThe strength here is authority and price: this is the primary source, and it is free. The trade-off is effort. A complete picture often means opening ACRIS, DOB, HPD, and ECB/OATH — the city's violation-hearings system — and stitching them together, which can take hours.",
      },
      {
        heading: 'Paid professional platforms',
        body: 'A second tier of commercial platforms packages property data for professionals. PropertyShark is an established NYC and tri-state platform with genuine local depth — ownership information, comparable sales, and building data in one place.\n\nCoStar is the largest US commercial real-estate data and analytics provider, strongest on national lease and sales comparables and market analytics; it is enterprise-priced and not focused on NYC regulatory data. Reonomy offers national commercial-property data along with owner-contact information and deal prospecting.\n\nThese tools are powerful, but they are built and priced for real-estate professionals — brokers, investors, and lenders — more than for a homeowner checking a single building. Their focus tends to be deals and market data rather than city compliance and violations.',
      },
      {
        heading: 'All-in-one compliance aggregators',
        body: "A third category sits between the two: aggregators that pull the official NYC records into a single building view. RegWatch NYC is one example — a tri-state compliance platform, deepest in NYC, that combines DOB, HPD, ECB/OATH, facade (FISP), ACRIS/title, liens, permits, and Certificate of Occupancy into one timeline, with a 0-100 Compliance Score.\n\nThe appeal is convenience and monitoring: instead of visiting several systems, you see one per-building record, and you can set alerts when something changes. You can run a basic search free at [RegWatch's NYC property search](https://regwatch.nyc/search); paid tiers add email monitoring, reports, and portfolio tools.\n\nAggregators do not replace the official systems — they gather from them. The convenience is real, but for anything critical the underlying city record remains the authority.",
      },
      {
        heading: 'How to choose the right tool',
        body: "The right choice depends on how often you look and how much you need. For a one-off question — who owns a building, or whether there is an open lien — the free city systems answer it directly, if you are willing to click through each one.\n\nIf you research properties for a living, a professional platform's comparables and market analytics may justify the cost. If you track buildings over time and want compliance and violations gathered in one place with alerts, an aggregator can save the hours that manual stitching takes. Side-by-side [comparisons of these tools](https://regwatch.nyc/compare) can help you weigh the trade-offs.\n\nMany people mix approaches: an aggregator or paid platform for day-to-day monitoring, and the official systems to confirm anything that carries legal or financial weight.",
      },
      {
        heading: 'Before you rely on any record',
        body: 'Public records can lag. Even data checked daily may trail an official filing by hours or days, and aggregated data can lag the source it copies. For anything time-sensitive, verify against the official agency directly.\n\nRemember what these tools are. ACRIS, DOB, and HPD remain the authoritative sources; everything else aggregates or repackages them. None of these tools, official or commercial, is title insurance or a title commitment.\n\nThis is general information, not legal advice. For formal title work or a closing, use a licensed title company or a real-estate attorney.',
      },
    ],
    faq: [
      {
        q: 'What is the best free way to check NYC property records?',
        a: "The city's own systems. ACRIS covers deeds, mortgages, and liens; DOB (BIS and DOB NOW) covers permits and building violations; HPD Online covers residential housing-code issues. They are authoritative and free, but you have to check each one separately.",
      },
      {
        q: 'Is ACRIS enough on its own?',
        a: 'ACRIS is the record for recorded documents — ownership, mortgages, and liens — but it does not show building violations, permits, or housing complaints. For those you also need DOB and HPD, which is why many people use several systems or an aggregator.',
      },
      {
        q: 'Do I need a paid platform to research an NYC property?',
        a: 'Not for a one-off check — the free city systems cover ownership, permits, and violations. Paid platforms and aggregators mainly save time by gathering scattered records in one place and adding monitoring, comparables, or reports, which matters more if you research properties regularly.',
      },
      {
        q: 'How current is NYC property data?',
        a: 'It varies. Official systems update on their own schedules, and third-party tools that copy from them can lag by hours or days. Treat any record as a strong lead, and verify anything critical against the official agency before you act on it.',
      },
      {
        q: 'Can these tools replace a title search?',
        a: 'No. None of these tools is title insurance or a title commitment, and public records can be incomplete or delayed. For a purchase, refinance, or any formal title work, use a licensed title company or a real-estate attorney.',
      },
    ],
  },
  {
    slug: 'regwatch-nyc-property-compliance-platform',
    title: 'RegWatch NYC: A Property Compliance Platform',
    h1: "Meet RegWatch NYC: One View of a Building's Full Record",
    metaDescription:
      "RegWatch NYC unifies a building's violations, permits, deeds, liens, and Certificate of Occupancy into one timeline with a 0-100 Compliance Score.",
    intro:
      'Every New York building has a paper trail scattered across a dozen city systems: building and housing violations, permits, deeds, liens, and its Certificate of Occupancy. RegWatch NYC pulls that record into one place. It aggregates public data from more than 250 government and data sources, checked daily, and presents each building as a single timeline with a 0-to-100 Compliance Score. Coverage spans the tri-state area and runs deepest in New York City. Here is what it does and what it costs.',
    sections: [
      {
        heading: 'One building, one timeline',
        body: "In New York, a single building's public record is split across many systems. RegWatch NYC gathers them: DOB (Department of Buildings) and HPD (Housing Preservation and Development) violations, ECB/OATH cases, FISP facade inspections, permits, ACRIS deeds and title, liens, and the Certificate of Occupancy.\n\nIt draws on more than 250 government and data sources, checked daily, spanning over 9.4 million addresses and 42 million recorded events. Each building becomes one timeline, topped with a Compliance Score from 0 to 100 that gives a fast read on where the property stands.",
      },
      {
        heading: 'Free to search, free account for more',
        body: 'You can [search any address for free](https://regwatch.nyc/search) and view a basic building profile without creating an account. It is a quick way to see what is on a property before you commit to anything.\n\nA free account unlocks more, including one saved building with in-app alerts when its record changes. Email monitoring and alerts move up to the paid plans.',
      },
      {
        heading: 'Who it helps',
        body: "RegWatch NYC is built for anyone who has to track a building's compliance. Owners and property managers use it to stay ahead of violations and deadlines; brokers and investors lean on it during diligence; lenders check exposure before a closing.\n\nAttorneys and title companies use it to scan a property's history quickly. One note for those users: RegWatch is not legal advice and not title insurance or a title commitment. For formal title work, rely on a licensed title company or a real-estate attorney.",
      },
      {
        heading: 'Plans and pricing',
        body: 'Searching is always free. For one-off documentation, a Comprehensive report is $12 as a one-time purchase. For ongoing use, Pro is $15 a month or $150 a year.\n\nPaid plans add email monitoring and alerts, AI property chat, PDF reports and exports, a portfolio dashboard, and broker tools such as a deal analyzer, lien calculator, and due-diligence features. Max, at $100 a month or $600 a year, adds branded PDF reports; Unlimited, at $200 a month or $1,200 a year, adds white-label reports. You can [compare the plans](https://regwatch.nyc/pricing) to pick a fit.',
      },
      {
        heading: 'A few things to keep in mind',
        body: "Coverage is tri-state — New York, New Jersey, and Connecticut — and is deepest in New York City. New Jersey and Connecticut are broader but shallower on regulatory detail.\n\nThe data is aggregated from public records and checked daily, but it can lag official filings, so verify anything critical against the official source. The city's own systems — ACRIS, DOB, and HPD — remain the authoritative record; RegWatch aggregates them into one view.",
      },
    ],
    faq: [
      {
        q: 'Is RegWatch NYC free to use?',
        a: 'Yes. Searching and viewing a basic building profile is free with no account. A free account adds one saved building with in-app alerts. Email monitoring, AI chat, reports, and broker tools are on the paid plans.',
      },
      {
        q: 'What records does it pull together?',
        a: 'DOB and HPD violations, ECB/OATH cases, FISP facade inspections, permits, ACRIS deeds and title, liens, and the Certificate of Occupancy, unified into one building timeline with a 0-to-100 Compliance Score.',
      },
      {
        q: 'Does it cover areas outside New York City?',
        a: 'Coverage is tri-state (NY/NJ/CT) and is deepest in NYC. New Jersey and Connecticut are broader but shallower on regulatory depth.',
      },
      {
        q: 'Can I rely on it for title work?',
        a: 'No. It is not legal advice and not title insurance or a title commitment. For formal title work, use a licensed title company or a real-estate attorney.',
      },
      {
        q: 'How current is the data?',
        a: 'Public records are aggregated and checked daily but may lag official filings. Official city systems such as ACRIS, DOB, and HPD remain the authoritative source, so verify anything critical there.',
      },
    ],
    sponsored: true,
  },
  {
    slug: 'nyc-open-housing-violations-data',
    title: "NYC's 2.9M Open Housing Violations, by the Numbers",
    h1: "NYC's Open Housing Violations, by the Numbers",
    metaDescription:
      "NYC lists about 2.9 million open HPD housing violations across 168,000+ buildings. See the borough and severity breakdown, and what 'open' really means.",
    intro:
      "New York City's housing agency records a violation every time an inspector finds a code problem: no heat, a leak, peeling lead paint, a broken lock. Most never formally close. As of July 2026, the city's public records list about 2.9 million open housing violations across roughly 169,000 buildings, according to NYC OpenData. Here is how that backlog breaks down by borough and severity, and why an open violation does not always mean an unfixed one.",
    sections: [
      {
        heading: 'About 2.9 million open violations',
        body: "The Department of Housing Preservation and Development (HPD) enforces New York City's housing maintenance code. Every time an inspector cites a condition, from a leak to a lack of heat, it becomes a recorded violation, and the city publishes them all through NYC OpenData.\n\nAs of July 2026, that dataset lists 2,875,206 violations with an open status, out of more than 11 million recorded since the early 2000s. Put another way, roughly one in four housing violations the city has ever written is still on the books as open.\n\nThat total is large for a reason worth understanding up front. A violation stays open until the owner certifies that it was corrected. Many owners fix the problem but never file that certification, so a meaningful share of these open violations describe conditions that were resolved long ago in the apartment but never closed on paper.",
      },
      {
        heading: 'Brooklyn and the Bronx carry the most',
        body: 'The open violations are not spread evenly. Brooklyn leads by a wide margin with about 1.21 million, followed by the Bronx with roughly 653,000. Queens (about 498,000) and Manhattan (about 448,000) sit well behind, and Staten Island trails with about 68,000.\n\nBrooklyn alone accounts for around 42 percent of the citywide total, and Brooklyn and the Bronx together make up nearly two-thirds of it.\n\nThese are raw counts, not rates. The boroughs with the most open violations are also those with the largest stock of older, multi-unit rental housing, so a higher tally partly reflects having more apartments to inspect, not only worse conditions.',
      },
      {
        heading: 'How serious are the violations?',
        body: "HPD sorts violations into classes by severity. Class A is non-hazardous, Class B is hazardous, and Class C is immediately hazardous, the tier that covers dangers like a lack of heat or hot water in winter.\n\nBy that scale, the open backlog skews toward the serious end. Class B, hazardous, is the largest group at about 1.37 million, nearly half of all open violations. Class C, immediately hazardous, accounts for about 582,000, or roughly one in five. Class A, non-hazardous, makes up about 681,000, and a smaller group of about 241,000 falls under a separate 'I' class.\n\nEven read with the certification caveat in mind, that mix shows a large number of serious, safety-related conditions sitting on the city's open rolls at any given time.",
      },
      {
        heading: 'A backlog that keeps growing',
        body: 'The open count is not just a historical residue. In the twelve months ending July 2026, HPD issued roughly 494,000 violations that are still open, close to half a million new open entries in a single year.\n\nThe violations are also concentrated. The 2.9 million open items are attached to about 168,835 distinct buildings, which works out to an average of roughly 17 open violations per affected building. A relatively small number of heavily-cited buildings carry a disproportionate share.\n\nFor a tenant, buyer, or lender, that concentration is the practical takeaway: the citywide total matters less than whether one specific building is among the heavily-cited ones.',
      },
      {
        heading: "Why one building's record is hard to read",
        body: "HPD violations are only part of a building's story. Housing-code issues live in HPD's system, but construction and safety problems sit with the Department of Buildings, and monetary penalties run through the ECB and OATH hearings system. No single official page stitches them together.\n\nThat is the gap tools in this space try to fill. Services like RegWatch aggregate the public records, so you can pull a building's [combined HPD, DOB, and ECB violation history](https://regwatch.nyc/nyc-violation-lookup) in one search rather than checking each system separately. The underlying data is still the city's; the value is in seeing it in one place.\n\nA final caveat: this analysis reflects the city's own status field. Because open includes uncertified but possibly-corrected violations, treat these figures as a map of the public record, not a live census of unsafe apartments, and verify any specific building against HPD directly. This is general information, not legal advice.",
      },
    ],
    faq: [
      {
        q: 'How many open housing violations does NYC have?',
        a: "About 2.9 million. NYC OpenData's HPD Housing Maintenance Code Violations dataset listed 2,875,206 violations marked open as of July 2026, out of more than 11 million recorded since the early 2000s. The figure includes older violations that were fixed but never formally certified as corrected.",
      },
      {
        q: 'Which NYC borough has the most housing violations?',
        a: 'Brooklyn, with about 1.21 million open violations, or roughly 42 percent of the citywide total. The Bronx is next at about 653,000, followed by Queens, Manhattan, and Staten Island. These are raw counts, so boroughs with more rental housing tend to show higher totals.',
      },
      {
        q: 'What do HPD violation classes A, B, and C mean?',
        a: 'Class A is non-hazardous, Class B is hazardous, and Class C is immediately hazardous, such as no heat or hot water. Among open violations, Class B is the largest group at about 1.37 million, and Class C accounts for roughly 582,000.',
      },
      {
        q: 'Does an open violation mean the problem still exists?',
        a: "Not necessarily. A violation stays open until the owner certifies the correction, and many owners fix the condition without filing that paperwork. So the open count reflects the city's records, not a live count of unresolved problems. Always verify a specific building with HPD.",
      },
      {
        q: 'Where does this data come from?',
        a: "NYC OpenData's 'Housing Maintenance Code Violations' dataset, published by HPD and queried in July 2026. It is public and free to search. Building-level violation data is also aggregated by third-party tools alongside DOB and ECB records.",
      },
    ],
  },
  {
    slug: 'nyc-unpaid-building-fines-data',
    title: '$3.13B in NYC building fines, $819M unpaid',
    h1: 'NYC building fines: $3.13 billion issued, about $819 million still unpaid',
    metaDescription:
      'NYC has issued about $3.13 billion in ECB/OATH building-code fines and is still owed roughly $819 million, per NYC OpenData. Brooklyn owes the most.',
    intro:
      'New York City has issued about $3.13 billion in building-code penalties through its OATH/ECB enforcement system, and it is still owed roughly $819 million of that total, according to NYC OpenData. The figures come from the DOB ECB (OATH) Violations dataset, queried in July 2026, covering 1,824,490 violations. The unpaid balance is largest in Brooklyn, and the Bronx is owed more than Manhattan despite issuing far fewer violations.',
    sections: [
      {
        heading: 'About $3.13 billion imposed, roughly $819 million unpaid',
        body: "New York City's building-code enforcement has produced about $3.13 billion in penalties over the life of the system, according to NYC OpenData. Of that, about $1.39 billion has been paid, leaving an unpaid balance of about $819 million. The records cover 1,824,490 violations.\n\nThe figures come from the DOB ECB (OATH) Violations dataset (6bgk-3dad), queried in July 2026. DOB is the city's Department of Buildings; ECB refers to the Environmental Control Board; and OATH is the Office of Administrative Trials and Hearings, which now runs the hearings for these cases.\n\nIn plain terms, these are civil penalties for building-code and related violations — the kind of tickets a building can accumulate over years. The dataset tracks how much was charged, how much came in, and how much is still outstanding.",
      },
      {
        heading: 'Brooklyn holds the largest unpaid balance',
        body: "Broken out by borough, Brooklyn carries the most unpaid money: about $293.9 million across 547,900 violations. Queens is next at about $207.6 million on 483,322 violations.\n\nThe Bronx follows at about $175.5 million on 248,334 violations, then Manhattan at about $111.0 million on 472,440 violations. Staten Island is smallest at about $31.2 million on 72,493 violations.\n\nThose five balances are cumulative and reflect the city's records as reported to NYC OpenData.",
      },
      {
        heading: 'The Bronx owes more than Manhattan',
        body: "One pattern stands out. The Bronx is owed about $175.5 million on 248,334 violations — more than Manhattan's about $111.0 million on 472,440 violations, even though Manhattan has roughly twice as many violations on record.\n\nThe dataset does not explain the gap, and these figures do not measure how much of each balance is realistically collectible. They show only what the city's records report as charged and unpaid.",
      },
      {
        heading: 'Most of the unpaid money sits in active cases',
        body: "Violations flagged as active status account for 275,903 of the cases and hold about $523.6 million in unpaid penalties — about 64% of the total unpaid balance, according to the dataset.\n\nThat leaves the rest spread across cases in other statuses. Importantly, a case marked 'resolved' can still carry an unpaid balance, so the outstanding money spans both active and resolved cases.",
      },
      {
        heading: 'How to read these numbers',
        body: "These totals are cumulative. The enforcement records run back to roughly 1988, so the figures represent decades of activity, not a single year. A high balance in one borough partly reflects how long and how heavily the system has operated there.\n\nTwo caveats matter. A 'resolved' status can still carry an unpaid balance, so unpaid money is not the same as open cases. And the data reflects the city's records, not a judgment of what is currently collectible.\n\nFor a single address, it helps to check the underlying records directly. RegWatch offers a [NYC ECB/OATH violation lookup](https://regwatch.nyc/nyc-ecb-violations) that surfaces a building's ECB/OATH penalties and whether unpaid fines have hardened into liens. Always verify a specific building or case against the official city agency, and treat this as general information, not legal advice.",
      },
    ],
    faq: [
      {
        q: 'How much does New York City say it is owed in building fines?',
        a: "About $819 million, according to NYC OpenData's DOB ECB (OATH) Violations dataset queried in July 2026. That is the unpaid balance out of about $3.13 billion in penalties imposed across 1,824,490 violations; about $1.39 billion has been paid.",
      },
      {
        q: 'Which borough owes the most?',
        a: 'Brooklyn, with about $293.9 million unpaid across 547,900 violations. Queens follows at about $207.6 million, the Bronx at about $175.5 million, Manhattan at about $111.0 million, and Staten Island at about $31.2 million.',
      },
      {
        q: 'Why does the Bronx owe more than Manhattan?',
        a: "The dataset does not say. It only shows that the Bronx has about $175.5 million unpaid on 248,334 violations, more than Manhattan's about $111.0 million on 472,440 violations — even though Manhattan has roughly twice as many violations on record.",
      },
      {
        q: "Does a 'resolved' case mean the fine was paid?",
        a: 'Not necessarily. A case marked resolved can still carry an unpaid balance, so unpaid money spans both active and resolved cases. Active-status violations alone hold about $523.6 million, about 64% of the unpaid total.',
      },
      {
        q: 'Do these figures cover a single year?',
        a: "No. They are cumulative and the records run back to roughly 1988, so they represent decades of enforcement. The numbers reflect the city's records, not a judgment of what is currently collectible. Verify any specific building or case against the official city agency; this is general information, not legal advice.",
      },
    ],
  },
  {
    slug: 'where-nyc-builds-permit-data',
    title: 'Manhattan leads NYC permits, but Queens builds the most',
    h1: 'Where New York City builds: DOB permits by borough',
    metaDescription:
      "Manhattan holds 1,624,255 of NYC's 3,989,483 building permits but issues the fewest new-building permits. Queens and Brooklyn lead. NYC OpenData.",
    intro:
      "New York City has issued 3,989,483 building permits in the record kept by NYC OpenData, and 1,624,255 of them were filed in Manhattan. Yet Manhattan issues the fewest new-building permits of any borough. The pattern comes from the city's DOB Permit Issuance dataset, queried in July 2026: most Manhattan permits cover alterations to existing buildings, while new construction is concentrated in Queens and Brooklyn.",
    sections: [
      {
        heading: 'Manhattan leads on permits but builds the least',
        body: "New York City's Department of Buildings (DOB) has issued 3,989,483 building permits in the record published by NYC OpenData, and Manhattan accounts for 1,624,255 of them. Brooklyn follows with 947,115, Queens with 841,002, the Bronx with 344,134, and Staten Island with 232,977.\n\nThe ranking flips for new construction. Although Manhattan files the most permits overall, it issues the fewest new-building permits of any borough, a sign that its building activity is dominated by work on structures that already exist.\n\nThese counts come from the DOB Permit Issuance dataset (dataset ipu4-2q9a), queried in July 2026. Each figure is a cumulative total, not an annual one.",
      },
      {
        heading: 'Where new construction is filed',
        body: 'Across the city, DOB has issued 571,507 new-building (NB) permits, the category for constructing a structure from the ground up. Queens leads with 181,523, followed closely by Brooklyn at 176,087.\n\nManhattan sits last with 37,067 new-building permits. Queens issues roughly five times as many as Manhattan (181,523 versus 37,067), while Staten Island, with 101,019, and the Bronx, with 75,811, both out-file the borough most associated with the New York skyline.\n\nThe gap reflects geography and land use. Manhattan is largely built out, so most of its activity is renovation rather than replacement, while the outer boroughs still have room for new housing and commercial stock.',
      },
      {
        heading: 'What most permits are for',
        body: "Sorted by job type, the dataset is dominated by alterations rather than new construction. Minor alterations (type A2) account for 2,389,439 permits, far more than any other category.\n\nNew buildings (NB) come next at 571,507, followed by major alterations (A1) at 434,633 and A3 permits at 413,610. Demolition (DM) permits number 102,287 citywide, and sign (SG) permits 78,007.\n\nBecause minor alterations lead by such a wide margin, the citywide picture is mostly one of maintaining and modifying existing buildings, which helps explain Manhattan's profile as a borough of renovation.",
      },
      {
        heading: 'How to read these numbers',
        body: "A few caveats matter. The totals are cumulative: the dataset spans roughly 1989 to the present, so these are not counts for any single year.\n\nEach row is one permit, not one building. A single project can generate several permits, and one building can appear many times over its life, so permit counts should not be read as building counts.\n\nIssuance dates are stored as text in the dataset, which means a clean year-by-year trend is not available through the data portal's API (the interface that lets software query the data directly). Treat the figures as a cumulative snapshot, not a time series.",
      },
      {
        heading: 'Checking a single building',
        body: "These borough-level totals describe the city as a whole, not any one address. To see the permit history of a specific property, you can look it up directly. Tools such as [RegWatch's NYC property search](https://regwatch.nyc/nyc-property-search) pull a single address's DOB permit record alongside its violations and other filings.\n\nFor any decision that turns on a particular building or case, verify the details against the official agency: the DOB for permits, HPD for housing, and the ECB or OATH for violations and hearings. Portal snapshots can lag or omit recent activity.\n\nThis article is general information drawn from public data, not legal advice.",
      },
    ],
    faq: [
      {
        q: 'How many building permits has New York City issued?',
        a: "3,989,483 in total, according to NYC OpenData's DOB Permit Issuance dataset (ipu4-2q9a), queried July 2026. The figure is cumulative, covering roughly 1989 to the present rather than a single year.",
      },
      {
        q: 'Which borough has the most building permits?',
        a: 'Manhattan, with 1,624,255 permits, the most of any borough. Brooklyn has 947,115, Queens 841,002, the Bronx 344,134, and Staten Island 232,977.',
      },
      {
        q: 'Which borough files the most new-building permits?',
        a: 'Queens, with 181,523 new-building permits, followed by Brooklyn at 176,087. Manhattan is lowest at 37,067, roughly five times fewer than Queens.',
      },
      {
        q: 'Why does Manhattan have so many permits but the fewest new buildings?',
        a: 'Most Manhattan permits are A2 minor alterations to existing buildings. The borough is largely built out, so its activity is renovation rather than new construction, which drives the overall count up while new-building permits stay low.',
      },
      {
        q: "Can I look up a specific address's permit history?",
        a: 'The public dataset is cumulative and counts permits, not buildings, so it does not summarize one property. For a single address, use an address search tool and verify the details against the DOB. This is general information, not legal advice.',
      },
    ],
  },
  {
    slug: 'nyc-unsafe-facades-fisp-data',
    title: "5,819 NYC facade filings rated 'Unsafe'",
    h1: "5,819 NYC facade-inspection filings came back rated 'Unsafe'",
    metaDescription:
      "NYC OpenData's facade dataset shows 5,819 filings rated 'Unsafe' and 32,127 'SWARMP'; more than half the unsafe filings — 3,059 of 5,819 — are in Manhattan.",
    intro:
      "Across New York City's facade-inspection filings, 5,819 have come back rated 'Unsafe' and another 32,127 are listed as 'SWARMP' — safe only with required repairs — according to NYC OpenData's DOB NOW: Safety Facades Compliance Filings dataset. The records cover 86,713 filings in all. More than half of the unsafe filings, 3,059 of 5,819, are in Manhattan. The data tracks filings, not unique buildings.",
    sections: [
      {
        heading: "5,819 filings came back rated 'Unsafe'",
        body: "New York City requires owners of buildings taller than six stories to have their facades inspected on a recurring cycle and to file the results with the city. Across those filings, 5,819 are rated 'Unsafe,' according to NYC OpenData, DOB NOW: Safety Facades Compliance Filings (dataset xubg-57si), queried July 2026.\n\nThe same records show 44,124 filings rated 'Safe' and 32,127 rated 'SWARMP,' a status that means the wall is stable for now but needs required repairs. Another 4,355 filings are marked 'No Report Filed,' meaning the owner never filed a result.\n\nIn total the dataset holds 86,713 filings, with 288 left blank. The program is administered by the Department of Buildings (DOB).",
      },
      {
        heading: 'More than half the unsafe filings are in Manhattan',
        body: "The unsafe filings are not spread evenly across the five boroughs. Manhattan accounts for 3,059 of the 5,819 unsafe filings — more than half.\n\nBrooklyn follows with 1,155 and the Bronx with 1,045. Queens has 519 unsafe filings, and Staten Island has 41.\n\nThe concentration in Manhattan tracks with where the city's tall buildings cluster, since the inspection requirement applies only to buildings above six stories.",
      },
      {
        heading: 'The most recent completed cycle',
        body: "Inspections run in five-year cycles. In the most recent completed cycle, known as Cycle 9, filings totaled 30,526.\n\nOf those, 13,433 were rated 'Safe' and 10,987 'SWARMP.' Another 3,622 came back 'Unsafe,' and 2,465 were 'No Report Filed.'\n\nThat works out to about 12% of Cycle 9 filings rated unsafe and about 36% rated SWARMP, according to the same NYC OpenData dataset.",
      },
      {
        heading: "What 'SWARMP' and the other labels mean",
        body: "'SWARMP' stands for 'Safe With A Repair And Maintenance Program.' It describes a facade that is deficient and needs scheduled repair — not a wall at immediate risk of collapse.\n\nAn important caveat: each row is a filing, not a unique building. The dataset holds one filing per building per five-year cycle, covering cycles 6 through 10, so the same address can appear more than once.\n\nThe program is the Facade Inspection Safety Program (FISP), the city's name for the [Local Law 11 facade compliance rules](https://regwatch.nyc/regulations/nyc-dob-ll11). RegWatch is one tool that tracks a building's FISP or Local Law 11 status and its filing deadlines.",
      },
      {
        heading: 'How to check a specific building',
        body: "The dataset is a citywide snapshot, not a verdict on any one address. Because rows are filings rather than buildings, and because a status can change between cycles, verify a specific building or case against the official agency — the Department of Buildings — before relying on it.\n\nThis article is general information drawn from public data, not legal advice. A building's current status, any matter before the Office of Administrative Trials and Hearings (OATH) or its Environmental Control Board (ECB), and pending deadlines should be confirmed with the city.\n\nThe figures here were queried in July 2026 and will shift as owners file for the current cycle.",
      },
    ],
    faq: [
      {
        q: "What does 'Unsafe' mean in a facade filing?",
        a: "An 'Unsafe' rating means the inspecting engineer found a facade condition that poses a risk to the public, obliging the owner to install protection and make repairs. Across the NYC OpenData facade dataset, 5,819 filings carry this status.",
      },
      {
        q: "What does 'SWARMP' mean?",
        a: "SWARMP stands for 'Safe With A Repair And Maintenance Program.' The facade is stable now but has deficiencies that need scheduled repair, not immediate action for collapse risk. The dataset lists 32,127 filings as SWARMP.",
      },
      {
        q: 'Why is Manhattan so heavily represented?',
        a: "Manhattan accounts for 3,059 of the 5,819 unsafe filings, more than half. The inspection requirement applies only to buildings taller than six stories, and Manhattan holds a large share of the city's tall buildings.",
      },
      {
        q: 'Does each filing represent a different building?',
        a: 'No. Each row is one filing per building per five-year cycle, covering cycles 6 through 10, so a single address can appear more than once. The counts are filings, not unique buildings.',
      },
      {
        q: 'How current is this data?',
        a: "The figures come from NYC OpenData's DOB NOW: Safety Facades Compliance Filings dataset (xubg-57si), queried July 2026. Confirm any specific building's status with the Department of Buildings, since this is general information, not legal advice.",
      },
    ],
  },
  {
    slug: 'nyc-heat-hot-water-complaints-data',
    title: '16.2M NYC housing problems: a third are heat or hot water',
    h1: 'New Yorkers have logged 16.2 million housing problems — a third about heat or hot water',
    metaDescription:
      'New Yorkers logged 16.2 million HPD housing-maintenance problems, per NYC OpenData. Roughly one in three is about heat or hot water; Bronx and Brooklyn lead.',
    intro:
      "New Yorkers have filed 16,191,607 individual housing-maintenance problems with the city's housing agency, according to NYC OpenData. Roughly one in three concerns heat or hot water, making it the most common housing grievance in the five boroughs. The records, drawn from the HPD Housing Maintenance Code Complaints and Problems dataset, cover reports made from roughly 2014 onward. Brooklyn and the Bronx account for the bulk of the total. Nearly all of these problems have since been closed.",
    sections: [
      {
        heading: 'Heat and hot water top the list',
        body: 'New Yorkers have logged 16,191,607 housing-maintenance problems with the Department of Housing Preservation and Development (HPD), according to NYC OpenData\'s HPD Housing Maintenance Code Complaints and Problems dataset (ygpa-z7cr), queried in July 2026. Each row is a single "problem," the specific issue a tenant reports.\n\nHeat and hot water dominate. The dataset logs 2,901,364 problems tagged HEAT/HOT WATER and another 2,509,671 tagged HEATING — about 5,411,035 combined, or roughly a third of everything reported.\n\nThat makes a cold apartment the city\'s single most common housing grievance, outpacing every other category by a wide margin.',
      },
      {
        heading: 'Plumbing, paint and pests come next',
        body: 'After heat, plumbing is the next-largest category, with 2,058,756 problems. Paint and plaster follow at 1,865,127, and a catch-all GENERAL category accounts for 1,812,526.\n\nUnsanitary conditions — a label that covers pests, mold and garbage — total 1,305,187. Electrical problems, at 838,108, round out the major categories tracked in the data.',
      },
      {
        heading: 'The Bronx nearly matches Brooklyn',
        body: 'By borough, Brooklyn leads with 5,398,468 problems and the Bronx follows closely at 5,113,360. Manhattan records 3,440,536, Queens 1,984,344 and Staten Island 254,899.\n\nThe Bronx figure stands out: the borough has a smaller housing stock than Brooklyn yet logs nearly as many problems. The two boroughs together account for most of the citywide total.',
      },
      {
        heading: 'Nearly all problems are closed',
        body: 'The vast majority of these problems are resolved, at least on paper. HPD marks 16,143,010 as CLOSE (closed) against 48,597 that remain OPEN.\n\nAmong those still open, 2,602 are heat or hot water problems. A status of "open" reflects the record as logged, not necessarily the current condition of an apartment.',
      },
      {
        heading: 'How to read these numbers',
        body: "A few caveats matter. Each row is an individual problem, and one tenant complaint can generate several, so 16.2 million is a count of problems, not of complaints or of buildings. The figures are unverified tenant reports, not adjudicated violations, and the merged dataset runs from roughly 2014.\n\nTo check the record for one address, you can look it up directly. Tools like RegWatch let you [look up a building's HPD complaint and violation history](https://regwatch.nyc/hpd-violation-lookup) in one place, alongside actions from agencies such as DOB, ECB and OATH.\n\nThis article is general information, not legal advice. Always verify a specific building or case against the official agency record before relying on it.",
      },
    ],
    faq: [
      {
        q: 'How many housing complaints has NYC logged?',
        a: "NYC OpenData's HPD dataset lists 16,191,607 individual maintenance problems, drawn from reports since roughly 2014. Each row is one problem, so the total counts problems, not complaints or buildings.",
      },
      {
        q: 'What is the most common housing complaint in NYC?',
        a: 'Heat and hot water. HEAT/HOT WATER (2,901,364) and HEATING (2,509,671) problems combine to about 5,411,035, or roughly one in three of all logged problems.',
      },
      {
        q: 'Which borough has the most HPD complaints?',
        a: 'Brooklyn, with 5,398,468 problems, narrowly ahead of the Bronx at 5,113,360. The Bronx nearly matches Brooklyn despite a smaller housing stock. Manhattan records 3,440,536, Queens 1,984,344 and Staten Island 254,899.',
      },
      {
        q: 'How many complaints are still open?',
        a: 'Of 16,191,607 problems, 16,143,010 are marked closed and 48,597 remain open, including 2,602 open heat or hot water problems.',
      },
      {
        q: 'Do these numbers mean the violations are confirmed?',
        a: 'No. They are unverified tenant reports, not adjudicated violations. To confirm the record for a specific building or case, check the official agency source. This is general information, not legal advice.',
      },
    ],
  },
  {
    slug: 'nyc-ll97-covers-apartment-buildings-data',
    title: '66% of NYC Local Law 97 buildings are apartments',
    h1: 'Two of every three Local Law 97 buildings are apartments, not offices',
    metaDescription:
      'NYC OpenData shows 68,575 of 103,259 benchmarking filings - about 66% - are apartment buildings, far more than the 7,578 offices tied to Local Law 97.',
    intro:
      "About two of every three buildings in New York City's energy-benchmarking dataset are multifamily housing, not the office towers usually linked to the city's climate law. NYC OpenData's Building Energy and Water Data Disclosure records 103,259 filings under Local Law 84; 68,575 of them, about 66 percent, are apartment buildings. Office buildings account for 7,578. The figures reframe who bears the weight of Local Law 97, the emissions-cap rule that draws on the same benchmarking data.",
    sections: [
      {
        heading: "What NYC's benchmarking data covers",
        body: "Local Law 84 requires owners of large buildings to file their annual energy and water use. The resulting dataset, published as Building Energy and Water Data Disclosure on NYC OpenData (dataset 5zyy-y8am), held 103,259 filings when queried in July 2026.\n\nThe filings span three report years: 30,485 for 2022, 33,684 for 2023, and 39,090 for 2024. Benchmarking - the practice of measuring a building's energy use so it can be compared over time - is the data backbone the city uses to administer Local Law 97, its building-emissions cap.",
      },
      {
        heading: 'Apartment buildings outnumber offices about nine to one',
        body: 'Multifamily housing - residential buildings with multiple units - accounts for 68,575 filings, about 66 percent of the dataset. Office buildings, the property type most often associated with the law, account for 7,578, roughly nine times fewer.\n\nThe rest of the list drops off quickly: K-12 schools (5,739), hotels (1,996), warehouses (1,429), colleges and universities (1,313), manufacturing sites (1,250), and retail (1,017). By count, Local Law 97 is largely a law about where New Yorkers live.',
      },
      {
        heading: 'Coverage has grown as thresholds phased in',
        body: "Annual filings rose about 28 percent from report year 2022 (30,485) to 2024 (39,090). The increase reflects the benchmarking mandate reaching more buildings as size thresholds were lowered over time.\n\nMore buildings in the dataset means more owners potentially facing Local Law 97's emissions caps, which the city phases in over time. The benchmarking count is not itself the compliance list, but it is the pool the city draws from.",
      },
      {
        heading: 'What the numbers do not show',
        body: 'The dataset covers only buildings above the roughly 25,000-square-foot benchmarking threshold, so smaller buildings are absent. Each row represents one building for one report year, which means 103,259 is a count of building-years, not unique buildings - a single building filing in all three years appears three times.\n\nThe energy-score fields contain "Not Available" placeholders in many records, so no average energy score is reported here. Readers should treat the property-type counts as a picture of what is filed, not a full census of the city\'s building stock.',
      },
      {
        heading: 'How to check a specific building',
        body: 'Whether an individual building falls under Local Law 97 depends on its size, use, and other factors that a citywide tally cannot resolve. RegWatch offers a [Local Law 97 compliance check](https://regwatch.nyc/ll97-compliance) that estimates whether a building is covered and what its emissions-cap exposure might be.\n\nThat estimate is a starting point, not a ruling. Verify a specific building or case against the official city agencies - the Department of Buildings (DOB), Housing Preservation and Development (HPD), and the enforcement bodies ECB and OATH - and treat this article as general information, not legal advice.',
      },
    ],
    faq: [
      {
        q: "How many buildings are in NYC's benchmarking dataset?",
        a: "NYC OpenData's Building Energy and Water Data Disclosure held 103,259 filings when queried in July 2026, split across report years 2022 (30,485), 2023 (33,684), and 2024 (39,090). Because each row is one building per year, that total counts building-years, not unique buildings.",
      },
      {
        q: 'What share of Local Law 97 buildings are apartments?',
        a: 'Multifamily housing makes up 68,575 filings, about 66 percent of the dataset - roughly two of every three. Office buildings account for 7,578, about nine times fewer.',
      },
      {
        q: 'Which property types come after multifamily and office?',
        a: 'By filing count: K-12 schools (5,739), hotels (1,996), warehouses (1,429), colleges and universities (1,313), manufacturing (1,250), and retail (1,017).',
      },
      {
        q: "Why doesn't the article report an average energy score?",
        a: 'The dataset\'s energy-score fields contain "Not Available" placeholders in many records, so no reliable average can be drawn from them. The counts here describe property types, not building performance.',
      },
      {
        q: 'Does being in the dataset mean a building must comply with Local Law 97?',
        a: 'Not necessarily. Benchmarking under Local Law 84 and emissions caps under Local Law 97 have related but distinct coverage rules. Verify any specific building against the Department of Buildings or the relevant city agency; this is general information, not legal advice.',
      },
    ],
  },
  {
    slug: 'nyc-work-without-permit-violations-data',
    title: "13,002 NYC 'work without permit' flags, 81% in 2 boroughs",
    h1: "NYC has 13,002 active 'work without a permit' violations — 81% in Brooklyn and Queens",
    metaDescription:
      "NYC OpenData lists 13,002 active 'work without a permit' violations, about 81% of them in Brooklyn and Queens. See the borough breakdown and caveats.",
    intro:
      "New York City's building department has 13,002 active violations for 'work without a permit' — a flag that construction or alteration happened without the required city approval. That count comes from NYC OpenData's DOB Violations dataset, queried in July 2026. About 81 percent of the active cases sit in just two boroughs: Brooklyn and Queens hold 10,573 of them combined. The same boroughs lead the city in new construction. Here is what the public data shows, and what it does not.",
    sections: [
      {
        heading: 'What the data shows',
        body: "NYC OpenData's DOB Violations dataset — the record kept in the Department of Buildings' Building Information System, or BIS — lists 13,002 active violations for work without a permit. A 'work without a permit' violation means the city recorded construction or alteration done without the approval it requires. The figure is drawn from NYC OpenData, DOB Violations (dataset 3h2n-5cm9), queried July 2026.\n\nThat 13,002 is a small slice of the file. The same dataset holds 2,475,641 DOB violations of all types, accumulated over decades. The work-without-permit flags are the ones that point specifically at unpermitted building.",
      },
      {
        heading: 'Where the active violations cluster',
        body: 'The active work-without-permit cases are heavily concentrated. Brooklyn has 5,848 and Queens has 4,725 — together 10,573, or about 81 percent of the citywide total.\n\nThe other three boroughs trail well behind. Manhattan has 1,224, the Bronx has 654, and Staten Island has 551.',
      },
      {
        heading: 'The same boroughs are building the most',
        body: "Brooklyn and Queens are also where much of the city's new construction is happening, so the concentration is not surprising on its face. More building generally means more chances for work to begin ahead of a permit.\n\nManhattan is a partial exception. With 1,224 active flags it sits far below the outer-borough leaders — the same borough that leads in alteration permits but trails in new construction.",
      },
      {
        heading: "What 'active' does and does not mean",
        body: "'Active' in the BIS system is not the same as 'current' or 'confirmed today.' The status can include older, uncertified cases that may be stale — a violation resolved in practice but never formally closed can still read as active.\n\nThis dataset also carries no dollar penalties. Fines for building violations live in a separate system run by the Environmental Control Board and the Office of Administrative Trials and Hearings — the ECB/OATH system — not in the BIS file counted here.\n\nCategory labels in the source data are inconsistent, so any single count should be read as an indicator rather than an exact tally. Treat these figures as general information, not legal advice.",
      },
      {
        heading: 'How to check a specific building',
        body: "Because the citywide numbers are indicators, verify a specific building or case against the official agency before drawing conclusions about an address. The Department of Buildings publishes the authoritative record for any given property.\n\nFor a quicker starting point, RegWatch, a tool that lets you [search a building's DOB violations](https://regwatch.nyc/dob-violation-search) by address, flags work-without-permit cases among the results. Use it to find leads, then confirm the details in the city's own system.",
      },
    ],
    faq: [
      {
        q: "What is a 'work without a permit' violation?",
        a: 'It is a Department of Buildings violation the city records when construction or alteration is done without the permit or approval it requires. In the data it flags unpermitted building work at a property.',
      },
      {
        q: 'How many active work-without-permit violations does NYC have?',
        a: "13,002, according to NYC OpenData's DOB Violations dataset (3h2n-5cm9), queried July 2026. That sits within a file of 2,475,641 DOB violations of all types.",
      },
      {
        q: 'Which boroughs have the most?',
        a: 'Brooklyn (5,848) and Queens (4,725) lead, together holding 10,573, or about 81 percent. Manhattan has 1,224, the Bronx 654, and Staten Island 551.',
      },
      {
        q: 'Does an active violation mean a fine is owed?',
        a: "Not necessarily. This dataset carries no dollar penalties; those live in the separate ECB/OATH system. 'Active' status can also include older, uncertified cases that may be stale.",
      },
      {
        q: 'How can I check a specific address?',
        a: "Verify the case against the Department of Buildings' official record before relying on it. This is general information, not legal advice.",
      },
    ],
  },
];

export const EVENTS: EvergreenPage[] = [
  {
    slug: 'fed-rate-decision-odds',
    title: 'Fed Rate Decision Odds: How Markets Price the FOMC',
    h1: 'Fed Rate Decision Odds Explained',
    metaDescription:
      'How prediction markets and futures price the odds of a Fed rate hike, hold, or cut, how FOMC meetings work, and which data moves the probabilities.',
    intro:
      '"Fed rate decision odds" are market-implied probabilities of whether the Federal Reserve will raise, hold, or lower its benchmark interest rate at an upcoming meeting. Prediction markets such as Polymarket and Kalshi, alongside fed funds futures, translate trader behavior into a percentage chance for each outcome. These figures reflect collective expectations, not certainty or advice, and they shift constantly as new economic data arrives. This hub explains how the decisions are made, how the odds are built, and what moves them.',
    sections: [
      {
        heading: 'What the FOMC is and what it decides',
        body: "The Federal Open Market Committee (FOMC) is the Federal Reserve's monetary-policy body. It sets the target range for the federal funds rate, the interest rate at which banks lend reserves to each other overnight, which in turn influences borrowing costs across the economy.\n\nThe FOMC has twelve voting members: the seven members of the Federal Reserve Board of Governors, the president of the Federal Reserve Bank of New York, and four of the remaining eleven regional Reserve Bank presidents, who rotate on one-year terms. The committee operates under a dual mandate set by Congress: maximum employment and stable prices. Since 2012 the Fed has defined stable prices as 2 percent annual inflation over the longer run, measured by the personal consumption expenditures (PCE) price index.",
      },
      {
        heading: 'How meetings and the calendar work',
        body: 'The FOMC holds eight regularly scheduled meetings per year, spaced roughly six weeks apart. Most meetings span two days, and the rate decision is published at 2:00 p.m. Eastern Time on the second day. As of recent years, the Fed Chair holds a press conference after every scheduled meeting.\n\nFour of the eight meetings, typically in March, June, September, and December, also release the Summary of Economic Projections (SEP). The SEP includes the "dot plot," a chart in which each policymaker marks where they expect the rate to sit at future dates. Because dates shift year to year, check the Fed\'s official calendar at federalreserve.gov for exact meeting days. The committee can also convene unscheduled meetings and, rarely, change rates between meetings if conditions demand it.',
      },
      {
        heading: 'How prediction markets price a hike, hold, or cut',
        body: 'A Fed-decision market asks a yes/no question, for example "Will the Fed cut rates at the next meeting?" or it offers separate contracts for each target range. Traders buy and sell shares that pay out if their outcome occurs, and the live price of each share, between 0 and 100 cents, is read as the market\'s implied probability. A contract trading near 80 cents implies roughly an 80 percent chance the market assigns to that outcome.\n\nA separate, widely cited gauge is the CME FedWatch tool, which derives probabilities from 30-day federal funds futures rather than from a betting market. Both approaches express the same idea, the crowd\'s best collective guess, but through different instruments. Treat every number as a probability that can be wrong, not a forecast or a recommendation.',
      },
      {
        heading: 'How these markets resolve',
        body: "Resolution is unusually clean because the outcome is unambiguous and public. The deciding source is the official FOMC statement published by the Federal Reserve, which states the new target range for the federal funds rate.\n\nIf the announced range matches a contract's condition, that contract settles to its full value; the others settle at zero. Settlement timing varies by platform but typically follows the 2:00 p.m. statement. A between-meeting or emergency rate change generally counts toward the relevant scheduled-meeting market, resolving the matching outcome when the official change is published. Always read a specific market's rules page, since the exact resolution window and edge cases vary by platform.",
      },
      {
        heading: 'What data moves the odds',
        body: "Rate-decision odds move whenever new information changes the expected path of policy. The most influential releases map to the dual mandate.\n\nInflation data, especially the Consumer Price Index (CPI) and the PCE price index, is central: hotter-than-expected inflation tends to push odds toward holds or hikes, while cooling inflation supports cut expectations. Labor-market data, including the monthly jobs report (nonfarm payrolls and the unemployment rate), signals economic strength. The dot plot and the Chair's press-conference language, often called forward guidance, can swing odds sharply even when the rate itself is unchanged. Growth figures such as GDP, plus speeches by Fed officials, also feed the probabilities. Because these inputs change frequently, read the odds as a live snapshot rather than a fixed value.",
      },
    ],
    faq: [
      {
        q: 'How many times a year does the Fed decide on interest rates?',
        a: "The FOMC holds eight regularly scheduled meetings per year, roughly every six weeks, and announces its rate decision at 2:00 p.m. Eastern on the second day of each meeting. It can also hold unscheduled meetings or, rarely, change rates between meetings if economic conditions require it. Exact dates are published on the Fed's official calendar.",
      },
      {
        q: 'What do Fed rate decision odds actually mean?',
        a: "They are market-implied probabilities of a hike, hold, or cut at an upcoming meeting. On prediction markets, a contract's price between 0 and 100 cents is read as the percentage chance of that outcome. The CME FedWatch tool derives similar probabilities from federal funds futures. These are crowd estimates that shift with new data, not guarantees or advice.",
      },
      {
        q: 'How do Fed rate markets resolve?',
        a: "They settle on the official FOMC statement from the Federal Reserve, which states the new target range for the federal funds rate. The matching contract pays out and others settle at zero, typically following the 2:00 p.m. announcement. Check each platform's rules for the exact resolution window and how emergency moves between meetings are handled.",
      },
      {
        q: 'What economic data moves Fed rate odds the most?',
        a: "Inflation readings like CPI and the PCE price index, plus the monthly jobs report (payrolls and unemployment), are the biggest drivers. The quarterly dot plot and the Chair's forward guidance can also swing odds sharply, sometimes more than the rate decision itself. GDP figures and Fed officials' speeches feed in as well.",
      },
      {
        q: 'What is the dot plot?',
        a: 'The dot plot is part of the Summary of Economic Projections, released at four FOMC meetings a year (typically March, June, September, and December). Each policymaker marks where they expect the federal funds rate to be at future dates. It is anonymous and not a binding commitment, but traders use it to gauge the likely path of rates and reprice odds accordingly.',
      },
    ],
    relatedTopics: ['Economics', 'Finance', 'Politics'],
  },
  {
    slug: 'us-presidential-election-2028-odds',
    title: '2028 US Presidential Election Odds Explained',
    h1: '2028 US Presidential Election Odds',
    metaDescription:
      'How 2028 US presidential election odds work: the primary-to-general race structure, key dates, how winner markets resolve, and why early odds swing.',
    intro:
      'Prediction markets let traders buy and sell contracts on who will win the 2028 US presidential election, and the live prices imply a probability for each candidate. These are crowd estimates, not forecasts of certainty or any form of advice. This hub explains how the race is structured from primaries to the general election, the dates that move odds, how election-winner markets resolve, and why prices this far out are volatile. The live-markets section above shows current numbers; this page explains how to read them.',
    sections: [
      {
        heading: 'How to read an election-odds number',
        body: "On prediction markets such as Polymarket and Kalshi, a contract on a candidate trades between 0 and 100 cents (or 0% to 100%). The price is the market's implied probability that the outcome happens. A candidate trading at 30 cents implies a roughly 30% chance of winning as priced by traders at that moment.\n\nA probability is not a prediction that something will or will not happen. Over many comparable situations, candidates priced near 30% would be expected to win about three times in ten — and lose the other seven. Across all candidates in a single market, prices tend toward summing near 100%, though small gaps appear from trading spreads and fees. Treat the number as a live consensus estimate that updates with news, not as a settled fact.",
      },
      {
        heading: 'The race structure: primaries, nomination, general',
        body: "A US presidential race runs in stages. First, each major party holds primaries and caucuses across the states through roughly the first half of the election year. Voters and caucus-goers award delegates to candidates, mostly in proportion to or based on their support.\n\nNext comes the nomination. Each party holds a national convention where delegates formally select the nominee. A candidate who has secured a majority of pledged delegates beforehand typically wins on the first ballot. The two parties also seat unpledged delegates, often called superdelegates; under current Democratic rules they generally cannot vote on the first ballot unless a candidate already has enough pledged delegates to win.\n\nFinally, the general election pits the parties' nominees, plus any independent or third-party candidates, against each other nationwide. Because of this funnel, markets usually run separate contracts for party nomination and for the overall winner.",
      },
      {
        heading: 'Key dates for 2028',
        body: 'Election Day is Tuesday, November 7, 2028, set by federal law as the first Tuesday after the first Monday in November. Before that, the primary and caucus calendar runs roughly from early 2028 through mid-year, though the parties were still finalizing the order of the early states as of mid-2026.\n\nThe national conventions follow in the summer of 2028. After Election Day, state electors meet in December 2028 to cast their Electoral College votes, Congress meets in joint session to count them on January 6, 2029, and the new president is inaugurated on January 20, 2029. Each of these dates can trigger sharp moves in the relevant markets.',
      },
      {
        heading: 'How the winner is actually decided',
        body: 'The president is not chosen by national popular vote but by the Electoral College. There are 538 electoral votes: each state receives a number equal to its seats in Congress (its representatives plus two senators), and the District of Columbia receives three under the 23rd Amendment. The allocation for 2028 reflects reapportionment from the 2020 census. A candidate needs a majority — 270 electoral votes — to win.\n\nIf no candidate reaches 270, the House of Representatives chooses the president, with each state delegation casting one vote and 26 states forming a majority. This is why state-level and Electoral College markets can diverge from national popularity, and why a candidate can lead in one measure while trailing in another.',
      },
      {
        heading: 'How winner markets resolve',
        body: "Resolution rules define exactly when a market pays out, so traders price toward that specific condition. On Polymarket, the 2028 presidential winner market is designed to settle once major news organizations call the race for the same candidate; if no such consensus call is reached by the inauguration date, it resolves based on who is inaugurated. On Kalshi, a CFTC-regulated US exchange, the comparable market verifies the outcome against the official result and settles after a person is inaugurated as president.\n\nThe practical takeaway: these markets resolve on who actually takes office, not on who leads in polls or who wins the popular vote. Always check a specific market's own rules before drawing conclusions, since wording and resolution sources vary by platform and by contract.",
      },
      {
        heading: 'Why early odds are volatile',
        body: 'Years before an election, the field is unsettled. Candidates have not all declared, no votes have been cast, and a single announcement, withdrawal, scandal, or health event can reprice the market quickly. With little hard information, traders lean on name recognition, fundraising, and early polling, all of which shift.\n\nEligibility also shapes the field. Under the 22nd Amendment, no one may be elected president more than twice, which constrains who can run. Until primaries actually allocate delegates, probabilities reflect expectations rather than results, so wide swings are normal and do not by themselves signal that the market is wrong. Volatility tends to narrow as the calendar advances and real outcomes replace speculation.',
      },
    ],
    faq: [
      {
        q: 'When is the 2028 US presidential election?',
        a: 'Election Day is Tuesday, November 7, 2028, fixed by federal law as the first Tuesday after the first Monday in November. Primaries and caucuses run earlier in 2028, the party conventions are held that summer, state electors cast Electoral College votes in December 2028, Congress counts them on January 6, 2029, and the winner is inaugurated on January 20, 2029.',
      },
      {
        q: 'How many electoral votes are needed to win in 2028?',
        a: 'A candidate needs 270 of the 538 electoral votes to win. Electoral votes are allocated by state based on its seats in Congress, with three for Washington, DC, and the 2028 distribution reflecting the 2020 census. If no candidate reaches 270, the House of Representatives selects the president, with each state delegation casting a single vote and 26 states needed to win.',
      },
      {
        q: "What does a candidate's price mean on a prediction market?",
        a: "The price, between 0 and 100 cents, is the market's implied probability that the candidate wins. A 40-cent price implies a roughly 40% chance as estimated by traders at that moment. It is a live crowd estimate, not a forecast of certainty and not advice. Prices update continuously as new information arrives.",
      },
      {
        q: 'How do 2028 election-winner markets resolve?',
        a: "They settle on who actually takes office, not on polls or the popular vote. Polymarket's design relies on major news organizations calling the race, defaulting to the inaugurated winner if there is no consensus call by Inauguration Day. Kalshi verifies the official result and settles after inauguration. Resolution wording varies by platform and contract, so check each market's specific rules.",
      },
      {
        q: 'Why do early 2028 odds swing so much?',
        a: 'This far out, the field is unsettled, few candidates have declared, and no votes have been cast. Announcements, withdrawals, polling shifts, or major news can reprice contracts quickly. With limited hard data, traders rely on name recognition and fundraising. Volatility is normal early and tends to narrow as primaries produce actual results.',
      },
    ],
    relatedTopics: ['Politics', 'World Elections', 'Geopolitics'],
  },
  {
    slug: 'us-recession-odds',
    title: 'US Recession Odds: How the Market Reads Them',
    h1: 'US Recession Odds: How Markets Price the Risk of a Downturn',
    metaDescription:
      'How US recession odds work: the NBER definition vs. the two-quarter rule, the indicators markets watch, how recession markets resolve, and why timing is hard.',
    intro:
      "A US recession market is a prediction market asking whether the world's largest economy will tip into a downturn, usually within a calendar year. The probability you see is the crowd's running estimate of that risk, not a forecast you should act on. This hub explains how a recession is officially defined, the indicators traders and economists track, how these markets actually resolve, and why calling the timing is genuinely hard. Prediction-market prices are probabilities, not advice.",
    sections: [
      {
        heading: 'What counts as a recession: NBER vs. the two-quarter rule',
        body: 'There are two competing ideas of what a recession is, and they do not always agree. The official US arbiter is the National Bureau of Economic Research (NBER), a private nonprofit. Its Business Cycle Dating Committee defines a recession as a significant decline in economic activity spread across the economy, lasting more than a few months, and normally visible in production, employment, real income, and other indicators. The committee weighs three things: the depth of the contraction, its duration, and how broadly the decline spreads across sectors (what it calls diffusion). It treats these as somewhat interchangeable, so an extreme reading on one can offset a weaker reading on another.\n\nThe more famous shorthand is the two-quarter rule: two consecutive quarters of falling real GDP. That rule traces to economist Julius Shiskin, who offered it in a December 1974 New York Times article as one of several rules of thumb, not as an official definition. It is a useful screen but produces false signals. The two-month COVID-19 recession in early 2020 was too short to register two full quarters, yet the NBER still dated it a recession. Conversely, GDP can dip for two quarters without the NBER ever declaring one. Knowing which definition a given market uses is the single most important thing before reading its odds.',
      },
      {
        heading: 'The indicators markets watch',
        body: "Recession probabilities move on data. A few signals carry outsized weight.\n\nThe yield curve. This plots interest rates on US Treasury securities across maturities. It normally slopes upward, with longer-term debt paying more. When short-term yields rise above long-term yields, the curve is inverted, which has historically preceded many US recessions. The yield curve reflects investor expectations about the future, which is why it is treated as a leading signal rather than a snapshot of today.\n\nThe labor market. The Sahm Rule, developed by economist Claudia Sahm, flags a likely recession when the national unemployment rate's three-month average rises 0.5 percentage points or more above its lowest point in the prior 12 months. It has historically triggered in US recessions since 1950, typically about three months after the downturn began, though it has also thrown occasional false signals. Crucially, it identifies a recession that has likely already started rather than forecasting one.\n\nGDP and output. Real GDP, industrial production, real income, and consumer spending show the current health of the economy. They confirm a downturn but lag the leading signals.",
      },
      {
        heading: 'How a recession market resolves',
        body: 'Resolution rules vary by platform and by the specific contract, so always read the rules before trusting the price. Most recession markets resolve on one of two bases.\n\nNBER-based markets resolve YES only if the Business Cycle Dating Committee formally declares (and dates) a recession overlapping the contract window. This is authoritative but slow: the NBER is deliberately retrospective and waits for revised data, so it often confirms a recession many months after it began, and dates a peak only once it is confident a contraction occurred.\n\nRule-based markets resolve on a mechanical trigger, most commonly two consecutive quarters of negative real GDP growth as reported by the Bureau of Economic Analysis, sometimes pegged to advance or revised estimates. These settle faster but can diverge from the official NBER call. Because the two definitions can disagree, the same economy can produce a YES on one market and a NO on another over the identical period. The resolution source and date cutoff are what actually determine payout.',
      },
      {
        heading: 'Why timing is hard',
        body: 'Recessions are easy to recognize in hindsight and notoriously hard to time in advance. The leading indicators warn that risk is elevated but not when a downturn will start; the yield curve has inverted well before recessions and also ahead of false alarms. The lagging indicators only confirm a downturn after it is underway. The official scorekeeper, the NBER, adds its own delay by waiting for clean data before dating a turning point.\n\nThis is why recession odds swing on each jobs report, GDP release, and Federal Reserve decision, and why a market can sit at moderate probability for a long stretch. A reading like 35 percent does not mean a recession is coming or not coming; it means the crowd judges roughly one-in-three odds over the contract window. Treat the number as a continuously updated gauge of risk, read it against the resolution rule and the underlying data, and remember it is a probability, not a prediction you should trade your finances on.',
      },
    ],
    faq: [
      {
        q: 'Who officially decides if the US is in a recession?',
        a: 'The National Bureau of Economic Research (NBER), a private nonprofit, is the recognized US arbiter. Its Business Cycle Dating Committee dates recessions by weighing the depth, duration, and breadth of a decline across indicators like employment, income, output, and spending. It works retrospectively and often confirms a recession months after it began.',
      },
      {
        q: 'Is two quarters of negative GDP an official recession?',
        a: 'No. The two-quarter rule is a rule of thumb, popularized from a 1974 suggestion by economist Julius Shiskin, not the official US definition. The NBER decides using a broad set of indicators. A downturn can be a recession without two negative quarters, as in early 2020, and two weak quarters do not guarantee an NBER call.',
      },
      {
        q: 'What does the yield curve have to do with recessions?',
        a: 'The yield curve plots Treasury interest rates across maturities. It usually slopes upward. When short-term yields exceed long-term yields, the curve inverts, which has historically preceded many US recessions. It reflects investor expectations, making it a leading signal, though it has also produced false alarms, so it warns of risk rather than guaranteeing a downturn.',
      },
      {
        q: 'What is the Sahm Rule?',
        a: 'The Sahm Rule, from economist Claudia Sahm, flags a likely recession when the three-month average unemployment rate rises 0.5 percentage points or more above its lowest point in the prior 12 months. It has historically triggered in US recessions since 1950, usually about three months in. It identifies a downturn already underway rather than forecasting one.',
      },
      {
        q: 'How does a US recession prediction market resolve?',
        a: 'It depends on the contract. NBER-based markets resolve YES only if the committee formally declares a recession in the window, which can take many months. Rule-based markets resolve on a mechanical trigger, often two consecutive quarters of negative real GDP. Because the definitions can disagree, always read the specific resolution source and date cutoff.',
      },
    ],
    relatedTopics: ['Economics', 'Finance', 'Politics'],
  },
  {
    slug: 'world-cup-2026-odds',
    title: '2026 World Cup Winner Odds Explained',
    h1: '2026 FIFA World Cup Winner Odds: How the Outright Markets Work',
    metaDescription:
      'How 2026 FIFA World Cup winner odds work and resolve on prediction markets, the expanded 48-team format and dates, and what moves the outright probabilities.',
    intro:
      'A 2026 FIFA World Cup "winner" market is a prediction market that prices the probability of each national team lifting the trophy. Prices update continuously as results come in across the tournament, which runs June 11 to July 19, 2026, across the United States, Canada and Mexico. This page explains how those outright markets are structured, how they resolve, and what causes the implied odds to move. Prediction-market prices are probabilities, not advice or guarantees.',
    sections: [
      {
        heading: 'What the 2026 World Cup is',
        body: "The 2026 FIFA World Cup is the 23rd edition of the men's World Cup and the first hosted by three nations: the United States (eleven host cities), Mexico (three) and Canada (two), sixteen host cities in all. It is also the first to use an expanded 48-team field, up from 32 at previous tournaments.\n\nThe schedule runs from June 11 to July 19, 2026, the longest World Cup to date at 39 days. The opening match was played at Estadio Azteca in Mexico City, and the final is scheduled for July 19 at MetLife Stadium in East Rutherford, New Jersey, near New York City. In total the tournament features 104 matches, up from 64 in 2022.",
      },
      {
        heading: 'How the expanded format works',
        body: "The 48 teams are split into 12 groups of four. The top two from each group advance automatically, joined by the eight best third-placed finishers, sending 32 teams into the knockout rounds. From there the bracket is single-elimination: Round of 32, Round of 16, quarter-finals, semi-finals, and the final, with a third-place match for the losing semi-finalists.\n\nThe group stage runs 72 matches and the knockout phase 32. The format matters for odds because the path to the trophy is longer than in the old 32-team event: a champion now wins through more rounds, and a difficult group draw or a tough knockout bracket can weigh on a team's implied probability even before a ball is kicked.",
      },
      {
        heading: 'How winner (outright) markets work',
        body: 'An outright or "to win the tournament" market lists every team that can still win and assigns each a price. On a prediction market that price is typically a share that pays a fixed amount (often $1) if that team wins and nothing if it does not, so the price reads directly as an implied probability. A team trading at 0.18 is priced at roughly an 18 percent chance.\n\nBecause the field is large, the probabilities across all teams sum to a little more than 100 percent, the difference reflecting fees and the spread. Traditional sportsbook odds (decimal or fractional) express the same idea but typically bake in a larger built-in margin, so prediction-market prices and bookmaker odds for the same team can differ. To compare, convert: implied probability is roughly 1 divided by the decimal odds.',
      },
      {
        heading: 'How these markets resolve',
        body: 'A World Cup winner market resolves to a single outcome: the team that wins the final, scheduled for July 19, 2026. When the champion is decided, shares for that team settle at the full payout and all other teams settle at zero. Markets generally resolve to the official FIFA result, including a final decided by extra time or a penalty shootout, since the shootout winner is the official champion.\n\nReputable markets publish explicit resolution rules covering edge cases such as a tournament being abandoned or a result being changed by an official ruling. Reading those rules before treating a price as settled is good practice, because resolution language, not the on-field celebration, determines payout.',
      },
      {
        heading: 'What moves the odds',
        body: "Outright prices move on new information. The biggest drivers are match results: a win, especially against a strong opponent, raises a team's implied probability while a loss or early exit can collapse it to near zero. As the bracket fills in, the strength of a team's remaining path is repriced too.\n\nOther inputs include injuries or suspensions to key players, lineup and form signals, and the knockout draw that sets who plays whom. Host nations can carry a modest edge from familiar conditions and crowd support. Before and during the group stage, prices tend to cluster among a handful of historically strong sides; this page avoids naming a fixed favorite because the live order changes with every result. To read the current standing, look at which team carries the highest implied probability on the market you are using and how it has shifted after recent matches.",
      },
    ],
    faq: [
      {
        q: 'When and where is the 2026 World Cup?',
        a: 'The 2026 FIFA World Cup runs from June 11 to July 19, 2026, across three host nations: the United States, Canada and Mexico. The opening match was played at Estadio Azteca in Mexico City, and the final is scheduled for July 19 at MetLife Stadium in East Rutherford, New Jersey. It is the longest World Cup to date at 39 days.',
      },
      {
        q: 'How many teams are in the 2026 World Cup?',
        a: 'The 2026 tournament features 48 teams, expanded from the 32 that competed in previous editions. They are divided into 12 groups of four. The top two from each group plus the eight best third-placed teams advance, sending 32 teams into the knockout rounds. In total the tournament includes 104 matches, up from 64 in 2022.',
      },
      {
        q: 'How do World Cup winner odds work?',
        a: "A winner or outright market prices each team's probability of lifting the trophy. On a prediction market the price reads directly as an implied probability, so 0.20 means about a 20 percent chance. The market resolves to the single team that wins the final, paying out winning shares and settling all other teams at zero.",
      },
      {
        q: 'What makes the odds move during the tournament?',
        a: "Match results are the main driver: wins raise a team's implied probability and losses or elimination push it toward zero. Injuries, suspensions, form and the knockout draw that sets each team's path also matter. Host nations may carry a slight edge from familiar conditions. Prices reprice continuously as new information arrives.",
      },
      {
        q: 'Are prediction-market odds a prediction of who will win?',
        a: "No. Prediction-market prices reflect the crowd's current estimate of each outcome's probability, not a guarantee or advice. They shift as results and news arrive, and the favorite can still lose. Treat the numbers as a real-time probability snapshot to read alongside reporting, not as a forecast of a certain result.",
      },
    ],
    relatedTopics: ['Soccer', 'Sports'],
  },
  {
    slug: 'super-bowl-odds',
    title: 'Super Bowl Odds: How NFL Futures Markets Work',
    h1: 'Super Bowl Odds and NFL Championship Futures',
    metaDescription:
      'How Super Bowl futures markets work, the NFL season and playoff timeline, how to-win-it-all odds resolve, and what moves them. A plain, evergreen explainer.',
    intro:
      "Super Bowl odds are prediction-market and sportsbook prices that estimate each team's probability of winning the NFL championship. They are quoted year-round, shift after every game, and resolve only when one team lifts the trophy. This page explains how those futures markets work, how they settle, what moves them, and where they sit on the NFL calendar. Treat any odds as a probability estimate, not advice.",
    sections: [
      {
        heading: 'What a Super Bowl futures market is',
        body: 'A future is a market on an outcome that resolves later in a season rather than on a single game. A Super Bowl future asks one question for each team: will this team win the next Super Bowl? On a prediction market such as Polymarket or Kalshi, each team trades as a separate contract priced between 0 and 1 (or 0 to 100 cents). A price of 0.12 implies roughly a 12 percent chance that team wins it all.\n\nBecause all 32 teams compete for one trophy, the implied probabilities across the field sum to approximately 100 percent on a clean prediction market, though small gaps exist from fees and trading spreads. At a traditional sportsbook the same idea is shown as American odds (for example +600), and the quoted prices deliberately add up to more than 100 percent — that overround is the house margin. Prediction markets, where users trade against each other, tend to carry a thinner built-in margin.\n\nProbabilities are not predictions of certainty. A favorite at 20 percent is still far more likely to lose than to win; it is simply the single most likely champion in a wide field.',
      },
      {
        heading: 'The NFL season and playoff timeline',
        body: 'Super Bowl odds move along a fixed calendar, so reading them well means knowing where the season stands.\n\nThe regular season runs 18 weeks, during which each of the 32 teams plays 17 games and takes one bye week, for 272 games in total. The league is split into two conferences, the AFC and NFC, each with four divisions of four teams.\n\nFourteen teams reach the playoffs, seven per conference: the four division winners plus three wild-card teams in each conference. The postseason is single elimination. Under the format the NFL has used since 2020, only the No. 1 seed in each conference earns a first-round bye; the others play in the Wild Card round, followed by the Divisional round, the Conference Championships, and finally the Super Bowl, which is played in early February.',
      },
      {
        heading: 'How the market resolves',
        body: "A Super Bowl future settles on a single, unambiguous event: which team wins the championship game. When the final whistle blows, the winning team's contract resolves to 1 (100 cents) and every other team's contract resolves to 0.\n\nThere are no partial payouts. Reaching the Super Bowl and losing it resolves a team's to-win-it-all contract at 0, the same as a team eliminated in the Wild Card round. This is why prices can stay well below 50 percent even for the two finalists: until the game is decided, each carries real losing risk.\n\nMarkets typically settle using the official NFL result. Edge cases such as a postponed game usually delay resolution rather than change the criteria, and each venue publishes its own rules for rare scenarios.",
      },
      {
        heading: 'What moves Super Bowl odds',
        body: "Prices update continuously as new information arrives. The largest moves cluster around a few drivers.\n\nGame results are the biggest force. Every win and loss reshapes the playoff picture, and a team that secures a top seed and a bye sees its odds jump because it has a clearer, shorter path to the title.\n\nInjuries matter enormously in a sport built around the quarterback. News that a starting quarterback is hurt — or returning — can swing a contender's price sharply within minutes.\n\nSeeding and matchups drive late-season and playoff moves. Home-field advantage, a favorable bracket, or the elimination of a rival all change a team's probability even when that team did not play.\n\nMarket structure and liquidity also play a role. Thinly traded long-shot contracts can show wider spreads and jumpier prices than heavily traded favorites.",
      },
      {
        heading: 'How to read the odds responsibly',
        body: "For a fast read, scan the field: the few teams with the highest prices are the market's consensus contenders, while the long tail of low-priced teams are seen as unlikely. Compare a contract's implied probability with your own view rather than treating the number as fact.\n\nBecause leaders, prices, and injury situations change week to week, this page does not name a current favorite — those specifics go stale quickly. Instead, check a live market for the latest prices and watch how they move after each weekend's games. Crowdtells reads these markets as a signal of what matters, then briefs the surrounding story with cross-source reporting. Prediction-market prices are probability estimates, not betting advice.",
      },
    ],
    faq: [
      {
        q: 'When is the next Super Bowl?',
        a: 'The Super Bowl is played annually in early February, usually on a Sunday, and caps an 18-week regular season followed by a single-elimination playoff bracket. The next edition, Super Bowl LXI, is scheduled for February 14, 2027, at SoFi Stadium in Inglewood, California. The NFL names each host stadium years in advance, so future dates and sites are set well ahead of time.',
      },
      {
        q: 'How do Super Bowl futures odds work?',
        a: 'Each team trades as a separate contract estimating its chance of winning the championship. On a prediction market the price runs from 0 to 1, so 0.10 implies about a 10 percent chance. Across all 32 teams the probabilities sum to roughly 100 percent, minus small spreads and fees. Prices update continuously as games are played.',
      },
      {
        q: 'What does it mean if a team is at +600 odds?',
        a: '+600 is American odds notation used by sportsbooks. It implies an estimated probability of about 14 percent (100 divided by 600 plus 100). Prediction markets show the same idea directly as a price, such as 0.14. Sportsbook odds across the field add up to more than 100 percent, a margin called the overround.',
      },
      {
        q: 'When do Super Bowl odds change the most?',
        a: "The sharpest moves follow game results, especially when a team clinches a top playoff seed and a first-round bye. Quarterback injuries and returns also swing prices quickly. During the playoffs, each round eliminates contenders, so surviving teams' odds rise step by step as the field narrows toward the championship.",
      },
      {
        q: 'How many teams make the NFL playoffs?',
        a: 'Fourteen teams reach the playoffs, seven from each conference: four division winners plus three wild-card teams per conference. Only the No. 1 seed in each conference gets a first-round bye. The bracket is single elimination, running through the Wild Card, Divisional, and Conference Championship rounds before the Super Bowl.',
      },
    ],
    relatedTopics: ['Sports', 'Economics', 'Finance'],
  },
  {
    slug: 'nba-finals-odds',
    title: 'NBA Finals Odds: How Championship Futures Work',
    h1: 'NBA Finals and Championship Odds, Explained',
    metaDescription:
      "How NBA championship futures and Finals odds work: playoff structure, how markets resolve, and what shifts a team's title probability across a season.",
    intro:
      'NBA championship odds are an estimate of how likely each team is to win the Larry O\'Brien Trophy, expressed as a probability. Prediction markets like Polymarket and Kalshi, alongside sportsbooks, run these "futures" markets year-round, repricing them as the season unfolds. This hub explains how the playoffs are structured, how championship markets are set and resolved, and what moves the numbers. A probability is a forecast, not advice or a guarantee.',
    sections: [
      {
        heading: 'How the NBA season and playoffs are structured',
        body: "The NBA has 30 teams split into the Eastern and Western Conferences. Each team plays an 82-game regular season, which determines seeding. After the regular season, the postseason begins.\n\nFirst is the Play-In Tournament. In each conference, the teams with the seventh through tenth best records compete for the final two playoff spots. The 7th seed hosts the 8th, and the winner takes the 7 seed. The 9th seed hosts the 10th; that winner then plays the loser of the 7-vs-8 game for the 8 seed.\n\nThat leaves 16 teams in the main bracket, eight per conference. Every round is a best-of-seven series: the conference quarterfinals (first round), conference semifinals, and conference finals. The two conference champions then meet in the NBA Finals, also a best-of-seven, played in a 2-2-1-1-1 home format. The Finals are typically held in June, and the winner receives the Larry O'Brien Championship Trophy.",
      },
      {
        heading: 'How championship futures markets work',
        body: "A championship future is a market on a single question: which team will win the title this season. Every team in contention has its own price or odds, and those prices map to an implied probability of winning it all.\n\nOn prediction markets such as Polymarket and Kalshi, contracts trade between 0 and 100 cents (or 0% to 100%). A team priced at 20 cents implies roughly a 20% chance of winning the championship. The price is set by what buyers and sellers are willing to trade at, so it moves continuously. At sportsbooks, the same idea is shown in American odds (for example +500), which you can convert to an implied probability.\n\nA key quirk: add up the implied probabilities for all teams at a sportsbook and the total exceeds 100%. That extra is the bookmaker's margin, often called the vig or overround. Peer-to-peer prediction markets price the field closer to 100% because traders take both sides directly.",
      },
      {
        heading: 'How the markets resolve',
        body: "A championship future resolves once the NBA Finals are decided. When one team wins four games in the Finals series, that team is the champion, and the market settles: contracts on the winner pay out in full, and every other team's contracts settle at zero.\n\nOn prediction markets, a winning share typically resolves to $1 (100 cents); on sportsbooks, a futures ticket pays at the odds locked in when the bet was placed. Because these markets are open for months, the price you could trade at in October may differ sharply from the price in May. The resolution outcome, though, is binary and unambiguous: there is exactly one champion per season.",
      },
      {
        heading: 'What shifts the odds across a season',
        body: "Championship odds are dynamic because new information constantly changes a team's outlook. The biggest drivers include:\n\nInjuries and player availability. A star sidelined for an extended stretch can sharply cut a contender's probability; a return can restore it.\n\nRoster moves. Trades, free-agent signings, and buyouts change a team's talent and depth, often moving odds the moment news breaks.\n\nForm and results. Win and loss streaks, strength of schedule, and head-to-head outcomes feed the market's read on who is peaking.\n\nSeeding and matchups. Once the bracket is set, a favorable or brutal path to the Finals reprices teams immediately. A high seed with home-court advantage is generally valued more than a play-in team.\n\nGame-by-game swings. During the playoffs, the result of a single game can shift or even flip the favorite, especially in a tight series. A road win, a blowout, or a key injury can each reprice a series within minutes of the final buzzer.",
      },
      {
        heading: 'How to read championship odds responsibly',
        body: 'Treat any odds figure as a snapshot of crowd or bookmaker expectation at one moment, not a prediction of what will happen. Markets are frequently wrong about individual seasons; their value is in calibration over many events, not certainty about one.\n\nBecause favorites and prices change daily, this hub does not list a current frontrunner. To see live numbers, check a championship market directly and convert the price to an implied probability. Compare a prediction market like Polymarket or Kalshi against a sportsbook line to see where the crowd and the bookmaker disagree. NBA championship markets have drawn heavy interest, with combined trading volume on the title question running into the hundreds of millions of dollars in recent seasons, which can make their prices more informative. None of this is betting advice; prediction markets express probability, not recommendation.',
      },
    ],
    faq: [
      {
        q: 'How many teams make the NBA playoffs?',
        a: 'Sixteen teams reach the main playoff bracket, eight from each conference. Before that, the Play-In Tournament involves the teams ranked seventh through tenth in each conference, who compete for the final two seeds. So 20 teams enter postseason play, but only 16 advance to the best-of-seven bracket.',
      },
      {
        q: 'How do NBA championship futures odds work?',
        a: "Each contender has a price that reflects its implied probability of winning the title. On prediction markets, contracts trade from 0 to 100 cents, so 25 cents means about a 25% chance. Sportsbooks show the same idea in American odds. Prices update continuously as news affects each team's outlook.",
      },
      {
        q: 'When do NBA championship futures markets resolve?',
        a: "They resolve when the NBA Finals end. The Finals are a best-of-seven series, so the first team to win four games is champion. At that point the winner's contracts pay out and all other teams settle at zero. The Finals are usually decided in June.",
      },
      {
        q: 'What makes NBA Finals odds change during a season?',
        a: 'Injuries, trades, free-agent signings, coaching changes, win and loss streaks, and strength of schedule all move odds. Once the playoff bracket is set, seeding and matchups reprice teams. During the playoffs a single game result can shift which team the market favors.',
      },
      {
        q: 'Are prediction-market odds the same as a forecast?',
        a: 'They are a probability estimate from the crowd, not a guarantee. A team at 30% can still lose, and underdogs sometimes win. The value of these markets is calibration across many events over time, not certainty about any single season. They reflect probability, not advice.',
      },
    ],
    relatedTopics: ['Sports', 'Economics', 'Finance'],
  },
  {
    slug: 'bitcoin-price-odds',
    title: 'Bitcoin Price Prediction Odds Explained',
    h1: 'Bitcoin Price Prediction Odds',
    metaDescription:
      'How Bitcoin price prediction markets work: what "BTC above $X by date" odds mean, how they resolve on Polymarket and Kalshi, and how to read them.',
    intro:
      'Bitcoin price prediction markets let traders buy and sell contracts on whether Bitcoin will be above (or below) a set price by a set date. The market price of a "Yes" contract, between 0 and 100 cents, reads as the crowd\'s implied probability of that outcome. These are forecasts, not advice, and they shift constantly as new information and money arrive. This hub explains how the markets are structured, how they resolve, what moves Bitcoin\'s price, and how to read the odds without over-trusting them.',
    sections: [
      {
        heading: 'How a "BTC above $X by date" market works',
        body: 'A price-threshold market poses a single yes-or-no question, such as "Will Bitcoin be above $150,000 by December 31?" Traders buy shares of the outcome they expect. Each share pays out a fixed amount (typically $1 or 100 cents) if it is correct and nothing if it is not, so the live price of a Yes share works as a rough probability: a Yes trading at 30 cents implies the market sees roughly a 30% chance.\n\nPlatforms list these contracts across many timeframes and many price levels at once — hourly, daily, weekly, monthly, and yearly horizons, and a ladder of thresholds (above $100k, above $120k, above $150k). Reading several thresholds together gives a fuller picture than any single number: the spread across price levels sketches the market\'s whole probability distribution for where Bitcoin might land.',
      },
      {
        heading: 'How these markets resolve',
        body: "Resolution is the moment a market settles to Yes or No and pays out. To avoid being decided by a single exchange's headline price, which can be noisy or manipulable, leading venues lean on independent price sources — but the exact source differs by platform, so it is worth checking each contract.\n\nKalshi, for example, resolves its Bitcoin price contracts against the CME CF Bitcoin Real-Time Index (BRTI) from CF Benchmarks, a benchmark that aggregates order-book data each second from vetted constituent exchanges; many of its markets use a trimmed-mean calculation over a measurement window, discarding outliers before averaging. Polymarket resolves through its UMA optimistic oracle, with crypto price contracts typically referencing a stated exchange data feed (such as a major exchange's BTC price). Because criteria and sources differ, the same-looking question can settle differently across platforms — always read the specific resolution text before trusting a price.",
      },
      {
        heading: 'Bitcoin volatility and what moves the price',
        body: "Bitcoin is volatile because it trades 24/7 across global venues, has no central bank or earnings to anchor valuation, and is sensitive to sentiment and liquidity. That said, volatility is not fixed. After U.S. spot Bitcoin ETFs were approved in January 2024, large institutional flows entered the market; studies of how this changed Bitcoin's volatility are mixed, with some pointing to calmer stretches between events and others to sharp, concentrated swings — and large moves clearly still occur.\n\nRecurring drivers include: macro liquidity and Federal Reserve policy (rate cuts and a weaker dollar tend to be supportive; tightening tends to pressure prices); ETF inflows and outflows, which move real spot demand; the roughly four-year halving cycle (the April 2024 halving cut the block reward from 6.25 to 3.125 BTC), historically associated with supply-driven rallies, though the strength of that pattern is now debated; regulation and policy headlines; and leverage-driven liquidations that amplify moves in both directions. No single factor dominates — markets reprice as these interact.",
      },
      {
        heading: 'How to read the odds without over-trusting them',
        body: 'Treat the contract price as a probability, not a prediction of where price "will" go. A market at 60 cents is saying the outcome is more likely than not, not that it is certain. Compare the full ladder of thresholds to see the implied range, and watch how prices move over time rather than fixating on one snapshot — a jump from 20 to 45 cents is itself information.\n\nCheck liquidity and the bid-ask spread: thin markets can show prices that reflect one trader, not consensus. Confirm the exact resolution source, date, and time, since edge cases (an early touch, a fixed-expiry read, a trimmed mean) change what "Yes" requires. And remember the limits: prediction markets aggregate opinion and money, they can be wrong, they can be moved by large traders, and they are probabilities, not financial advice.',
      },
      {
        heading: 'Where these markets trade and how they are regulated',
        body: 'Two venues are widely watched. Kalshi operates as a CFTC-regulated U.S. designated contract market, a status it has held since 2020. Polymarket runs a large on-chain prediction market; in July 2025 it acquired the parent of QCEX, a CFTC-licensed derivatives exchange and clearinghouse, and following CFTC clearance later in 2025 it began opening a regulated, U.S.-compliant path for American users. Regulatory treatment of prediction markets has continued to evolve, and the rules can change.\n\nCrowdtells reads these markets as a signal of what people are watching and pricing, then reports the story around them. Availability, fees, and eligibility differ by platform and jurisdiction, and terms change — verify current details directly on each venue before relying on them.',
      },
    ],
    faq: [
      {
        q: 'What does a Bitcoin price prediction probability actually mean?',
        a: 'It is the market\'s implied chance of an outcome, read from the contract price. A "BTC above $150k" Yes share trading at 25 cents implies roughly a 25% probability. The figure reflects aggregated trader money and opinion at that moment; it updates constantly and can be wrong. It is a forecast, not advice or a guarantee.',
      },
      {
        q: 'How do Bitcoin price markets decide the final price?',
        a: "It depends on the venue. Kalshi resolves against the CME CF Bitcoin Real-Time Index (BRTI) from CF Benchmarks, often using a trimmed-mean of values over a window. Polymarket resolves through its UMA oracle, with crypto contracts referencing a stated exchange feed. Some contracts settle on a touch during the window; others read a fixed expiry. Check each contract's rules.",
      },
      {
        q: 'Why is Bitcoin so volatile?',
        a: 'Bitcoin trades 24/7 worldwide with no central bank, earnings, or cash flows to anchor its value, so price leans heavily on sentiment, liquidity, and leverage. Macro policy, ETF flows, and the halving cycle all push it around. Research on whether volatility changed after spot ETFs launched in 2024 is mixed, but large swings still happen.',
      },
      {
        q: 'What is the Bitcoin halving and does it move price?',
        a: 'The halving roughly every four years cuts the reward miners earn per block, slowing new supply. The April 2024 halving reduced it from 6.25 to 3.125 BTC. Past cycles saw rallies afterward, which many attribute partly to the supply squeeze, but analysts debate how reliable the pattern remains as institutional demand reshapes the market.',
      },
      {
        q: 'Are Bitcoin prediction markets legal and regulated?',
        a: 'It depends on the platform and your location. Kalshi operates as a CFTC-regulated U.S. designated contract market. Polymarket acquired the CFTC-licensed QCEX in July 2025 and has been building a regulated U.S. path. The rules continue to evolve. Check current eligibility and terms on each platform; nothing here is legal or financial advice.',
      },
    ],
    relatedTopics: ['Crypto', 'Finance', 'Economics', 'Commodities'],
  },
  {
    slug: 'oscars-odds',
    title: 'Oscars Odds: How Academy Awards Markets Work',
    h1: 'Oscars Odds: A Guide to Academy Awards Prediction Markets',
    metaDescription:
      'How Oscars odds and Academy Awards prediction markets work: Best Picture, the awards-season timeline, what resolves a market, and what moves the numbers.',
    intro:
      'Oscars odds are prediction-market prices that estimate the chance each film or nominee wins an Academy Award. Markets on Polymarket and Kalshi treat these prices as crowd-weighted probabilities, not forecasts of quality or fairness. This hub explains how Academy Awards markets are structured, when they resolve, and what actually moves the numbers across awards season. Prediction-market prices are probabilities, not advice.',
    sections: [
      {
        heading: 'What the Academy Awards are',
        body: 'The Academy Awards, commonly called the Oscars, are the film honors given out each year by the Academy of Motion Picture Arts and Sciences (AMPAS), a professional membership body of filmmakers. The first ceremony was held in 1929 at the Hollywood Roosevelt Hotel, honoring films released across 1927 and 1928. Winners are chosen by Academy members, not critics or the public.\n\nThe most-watched market is Best Picture, but contracts also trade on the acting categories (Best Actor, Best Actress, Best Supporting Actor and Actress), Best Director, and craft and writing awards. Each category is a separate market with its own slate of nominees and its own price for every contender.',
      },
      {
        heading: 'The awards-season timeline',
        body: "Oscar season runs roughly from late summer through the spring ceremony. The shape repeats every year, even though exact dates shift.\n\nFall film festivals — chiefly Venice, Telluride, and Toronto (TIFF) — launch most serious contenders from late August through September. Strong receptions here often set the early favorites. Critics' groups and the Golden Globes follow in late autumn and winter, then the industry guilds weigh in around January and February.\n\nThe Academy's own calendar is the spine of the season. Eligible films must have a qualifying release within the eligibility year. Nominations voting typically happens in mid-January, with nominees announced soon after. Final voting opens in late February and closes days before the ceremony, which is usually held in late winter or early spring. The 98th Oscars ceremony, for example, was held on March 15, 2026, with nominees announced January 22, 2026.",
      },
      {
        heading: 'How a film wins Best Picture',
        body: "Best Picture uses a preferential (ranked-choice) ballot, which is unusual among Oscar categories. All voting Academy members rank the nominees in order of preference. If no film has a majority of first-place votes, the lowest-ranked film is eliminated and its ballots transfer to each voter's next choice. The process repeats until one film passes 50 percent.\n\nThis matters for odds. A broadly liked consensus film can beat a movie with passionate but narrower support, because second- and third-place rankings decide close races. Most other categories — including the acting awards and Best Director — use a simple plurality: the nominee with the most votes wins.\n\nOne rule change worth noting: for the 2026 ceremony, the Academy began requiring members to confirm they have viewed all nominees in a category before voting in that category's final round, a shift from the previous honor system. Rules like this can affect how broadly the field is judged, so it is worth checking the Academy's current rules each season.",
      },
      {
        heading: 'How Oscars markets resolve',
        body: "An Oscars prediction market resolves on the official winner announced during the live ceremony. A Best Picture market for a given film pays out its 'Yes' shares if that film is named the winner, and the others settle at zero. Because each category is winner-take-all, the prices across all nominees in one category tend to sum toward 100 percent.\n\nResolution is tied to the on-stage result certified by the Academy and its independent ballot tabulators. Always read the specific market's resolution text on Polymarket or Kalshi: it names the exact ceremony, the category, and how edge cases (a tie, a postponed ceremony, a rescinded award) would be handled before placing any weight on a price.",
      },
      {
        heading: 'What moves Oscars odds',
        body: "Prices move as new information arrives about how Academy voters are leaning. The strongest signals are the precursor awards, especially the industry guilds, whose memberships overlap with the Academy.\n\nThe Producers Guild (PGA), Directors Guild (DGA), and Screen Actors Guild (SAG) awards are watched closely as Best Picture and acting bellwethers. The PGA and DGA, in particular, have a strong historical record of foreshadowing the Best Picture winner — especially when both align on the same film — while SAG, the Golden Globes, and critics' awards correlate less tightly. A film that sweeps PGA and DGA often sees its odds firm up sharply.\n\nOther catalysts include festival reception, nomination counts and surprises, box-office and review momentum, late-breaking campaign narratives or controversy, and the simple shrinking of the field as voting deadlines pass. Because prices reflect a crowd's read of these signals, treat a moving number as a changing probability, not a verdict — markets are frequently wrong, and a favorite is not a sure thing.",
      },
    ],
    faq: [
      {
        q: 'When are the Oscars held each year?',
        a: "The Academy Awards ceremony is typically held in late winter or early spring, honoring films from the previous eligibility year. Exact dates change annually. The 98th Oscars were held on March 15, 2026, with nominees announced January 22, 2026. Check the Academy's official calendar each season, since the Academy sometimes adjusts ceremony dates years in advance.",
      },
      {
        q: 'How do Best Picture odds work on prediction markets?',
        a: "Each nominee gets its own contract priced as a percentage chance of winning. The prices across all nominees in the category roughly add up to 100 percent. A market resolves when the Academy names the winner on stage: the winning film's shares pay out and the rest settle at zero. Prices are probabilities, not guarantees.",
      },
      {
        q: 'What is the best predictor of the Best Picture winner?',
        a: "Industry guild awards are the strongest signals because guild members overlap with Academy voters. The Producers Guild (PGA) and Directors Guild (DGA) awards have historically been among the most reliable Best Picture predictors, particularly when they agree on the same film. The SAG awards, Golden Globes, and critics' prizes correlate less reliably but still move odds when results surprise.",
      },
      {
        q: 'Why does Best Picture use ranked-choice voting?',
        a: "Best Picture is decided by a preferential ballot, where voters rank nominees. If no film wins an outright majority, the last-place film is eliminated and its votes transfer to voters' next choices until one film passes 50 percent. This rewards broadly liked consensus films and is why a movie with wide second-place support can beat one with narrower, more passionate backing.",
      },
      {
        q: 'Are Oscars prediction markets the same as betting on quality?',
        a: 'No. Oscars odds estimate the probability that Academy members will vote a given way, not which film is best or most deserving. Prices reflect crowd reads of precursor awards, campaigns, and voting patterns. They are probabilities, shift as new information arrives, and are often wrong. They are not advice or a measure of artistic merit.',
      },
    ],
    relatedTopics: ['Entertainment', 'Politics'],
  },
  {
    slug: 'midterm-elections-2026-odds',
    title: '2026 Midterm Elections Odds: How Markets Price Control of Congress',
    h1: '2026 Midterm Elections Odds',
    metaDescription:
      "2026 US midterm odds explained: what's up in the House, Senate and governorships, how control markets resolve, and what moves the implied probabilities.",
    intro:
      'The 2026 US midterm elections are scheduled for November 3, 2026, and they will decide which party controls each chamber of the 120th Congress. Voters will fill all 435 seats in the House of Representatives, roughly a third of the Senate, and most of the country\'s governorships on the same day. Prediction markets such as Polymarket and Kalshi run continuous "control of the House" and "control of the Senate" contracts whose prices read as a money-weighted estimate of each party\'s chances. This page explains what is actually on the ballot, how those control markets are framed and how they resolve, what moves the odds between now and Election Day, and the dates worth watching. Throughout, treat market prices as crowd-implied probabilities that can be wrong; nothing here is financial advice.',
    sections: [
      {
        heading: 'What is on the ballot in 2026',
        body: "Every seat in the House of Representatives is up in a midterm year, so all 435 districts are contested on November 3, 2026. A party needs 218 seats for a majority. Heading into the election, Republicans hold a narrow House majority of roughly 218 seats to Democrats' 212, which is one of the slimmest margins in modern history and a large part of why control is treated as genuinely uncertain.\n\nThe Senate works differently. Only one of its three classes faces voters in any cycle, and in 2026 that is Class 2. Counting two special elections, the map has Republicans defending about 22 of the contested seats and Democrats defending 13. Going in, Republicans hold 53 seats to the 47 that Democrats and the two independents who caucus with them control. A simple majority is 51 seats, so a tie at 50-50 is broken by the vice president, whose party currently holds the White House. Because Democrats are defending fewer seats but must flip a net of four Republican-held seats to reach 51 (Republicans can lose only two and keep their majority), analysts have generally described the 2026 Senate map as harder terrain for them than the House.\n\nTwo of the Senate contests are special elections to fill seats vacated mid-term: one in Ohio, after JD Vance resigned to become vice president, and one in Florida, after Marco Rubio left to become secretary of state. The winners serve out the remainder of those terms. Beyond Congress, 36 states elect governors in 2026, along with many state legislatures, attorneys general, and local offices, which is why the cycle reaches well past control of Washington.",
      },
      {
        heading: 'How prediction markets frame control of Congress',
        body: "The headline markets are straightforward yes/no questions: which party will control the House, and which party will control the Senate, when the new Congress is seated. On Polymarket and Kalshi these trade as shares priced between roughly 1 cent and 99 cents. A price reads directly as an implied probability, so a 'Democratic House' share trading at 60 cents corresponds to a market-implied 60 percent chance. The two chambers are priced separately, and some venues also list a combined 'balance of power' market covering the four possible House-plus-Senate outcomes at once.\n\nThese prices are a money-weighted aggregate of what traders collectively expect, updated continuously as new polling, candidate news, and results arrive. That is their value as a news signal: they compress a flood of forecasts and reporting into a single number that moves in real time. It is also their limit. A market price is not a forecast from any single model or expert, it reflects the views and risk appetite of whoever is trading, and it can be moved by thin volume or by sentiment that later proves wrong. Markets misprice events, sometimes badly, so the honest way to read a control price is as one probability estimate among several, not as a settled outcome.\n\nCrowdtells treats these markets as a read on what is worth covering rather than as something to trade. When a control price swings, it usually means real news moved underneath it, and that news is the story.",
      },
      {
        heading: 'How the markets resolve',
        body: "A control market only pays out once the result is settled by an agreed-upon source, which is what keeps the contract objective. For the 2026 congressional markets, resolution has typically been tied to multiple major election callers, with venues citing decision desks such as the Associated Press, Fox News, and NBC News, and resolving once those sources have conclusively called the chamber.\n\nThe definition of 'control' is written into each market's rules. For the House, a party controls the chamber if it wins a majority of the voting seats, meaning 218 or more. For the Senate, control generally means holding more than half of the voting members, or holding exactly half with the vice president of that party able to break ties. Because the Senate can sit at 50-50, the rules account for the vice-presidential tiebreak so the contract still has a clear winner. To pin down edge cases, Kalshi has framed Senate resolution around the party of the president pro tempore of the Senate as of a set date in early 2027, after the new Congress is seated, rather than on election night alone.\n\nThat distinction matters because close races can take days to call, recounts and runoffs can delay an official result, and a seat can change hands between the vote and the seating of Congress. Always read the specific market's resolution text. Two contracts on the same question can settle on slightly different criteria or dates, and that fine print is exactly what determines who is right.",
      },
      {
        heading: 'What moves the odds',
        body: "The single most-watched input is the generic congressional ballot, the polling question asking which party's candidate voters would support for Congress. A widening or narrowing lead there tends to move House control prices quickly, because a national swing maps roughly onto seats. As of mid-June 2026, generic-ballot averages showed Democrats ahead by several points, which is consistent with the House being treated as competitive rather than safe for either side.\n\nPresidential approval is the other broad driver. Midterms are widely read as a referendum on the party that holds the White House, and history sets a strong prior: since 1934 the president's party has lost House seats in almost every midterm, by an average of roughly 28 seats. The clearest exceptions came in 1998, when a strong economy and backlash to impeachment helped the president's party, and in 2002, when post-September 11 approval lifted it. Markets read low presidential approval as a tailwind for the out-party, and they move when approval shifts.\n\nNarrower factors move individual races and, through them, the chamber totals. Candidate quality, primary results, retirements that open competitive seats, fundraising, and scandal all feed in. Redistricting has been an unusually large factor this cycle: a mid-decade round of map changes, led by a Republican-drawn Texas map and a Democratic-drawn California response, shifted the partisan lean of several districts before a single 2026 vote was cast, and court rulings on those maps moved the baseline. As actual results report on election night, the markets converge toward certainty, with prices snapping to near 0 or near 100 as chambers are called.",
      },
      {
        heading: 'Key dates to watch',
        body: "The fixed anchor is Election Day, Tuesday, November 3, 2026, when House, Senate, and gubernatorial races are decided. In practice the calendar that moves odds is longer. Primary season runs through the spring and summer of 2026, and each primary resolves who the nominees are, which is when 'candidate quality' stops being a guess. Filing deadlines and any court decisions on contested district maps also land earlier in the year and reset the baseline for affected seats.\n\nIn the final stretch, the steady drip of generic-ballot polling and presidential-approval readings drives most of the day-to-day movement in control prices. Early and mail voting begins weeks before Election Day in many states, and the share and partisan lean of returned ballots becomes a real-time input. On election night and the days after, markets move as decision desks call individual races and, eventually, each chamber.\n\nResolution can lag the vote. Close contests, automatic recounts, and any required runoffs can push a final call past November, which is why control markets sometimes stay open after Election Day. The new Congress is seated in January 2027, and any market that resolves on the seated majority settles around then. As with every figure here, dates and standings can change, so check current sources before relying on any specific number, and remember that none of this is financial advice.",
      },
    ],
    faq: [
      {
        q: 'When are the 2026 midterm elections?',
        a: 'The 2026 US midterm elections are scheduled for Tuesday, November 3, 2026. On that day voters decide all 435 House seats, the Class 2 Senate seats plus two special elections, and governorships in most states. Many states also allow early and mail voting in the weeks beforehand, and some close races may not be called until days later. None of this is financial advice.',
      },
      {
        q: 'How many seats are up in the Senate in 2026?',
        a: "Roughly a third of the Senate is contested, which in 2026 is the Class 2 group, and counting two special elections that means Republicans are defending about 22 of the seats and Democrats 13. A party needs 51 seats for a majority, or 50 plus the vice president's tie-breaking vote. Standings and seat counts can shift, so confirm current figures before relying on them.",
      },
      {
        q: 'How do prediction markets on control of Congress resolve?',
        a: "A control market pays out once major election callers, such as the Associated Press, Fox News, and NBC News, have conclusively decided the chamber. The House goes to whichever party wins at least 218 seats, and the Senate to whichever party holds a majority including the vice-presidential tiebreak. Exact wording and resolution dates vary by venue, so read each market's rules rather than assuming they match.",
      },
      {
        q: "Does the president's party usually lose seats in the midterms?",
        a: "Yes. Since 1934 the president's party has lost House seats in nearly every midterm, by an average of roughly 28, with rare exceptions in 1998 and 2002. That history is one reason markets often lean toward the party out of power, especially when presidential approval is low. It is a prior, not a guarantee, and prices can be wrong, so this is not financial advice.",
      },
      {
        q: 'What moves the odds on the 2026 midterms?',
        a: 'The generic congressional ballot and presidential approval drive most of the broad movement, while candidate quality, primary results, retirements, and redistricting move individual races. As of mid-June 2026, generic-ballot averages showed Democrats ahead by several points. Prices update continuously as this news arrives and snap toward certainty as results are called on election night.',
      },
    ],
    relatedTopics: ['Politics', 'US Election', 'Economics'],
  },
  {
    slug: 'government-shutdown-odds',
    title: 'Government Shutdown Odds: How Markets Price a Funding Lapse',
    h1: 'Government Shutdown Odds: How Markets Price a Funding Lapse',
    metaDescription:
      'Government shutdown odds explained: how a federal funding lapse works, the appropriations and continuing-resolution calendar, and how shutdown markets resolve.',
    intro:
      'A federal government shutdown happens when Congress and the president fail to enact funding for parts of the government before existing appropriations expire, forcing affected agencies to halt non-essential operations. Prediction markets on Polymarket and Kalshi turn each funding deadline into a money-weighted probability — a "will the government shut down by [date]" contract whose price reads as the crowd\'s implied odds of a lapse. This page explains what a shutdown is, how the appropriations and continuing-resolution process sets the deadlines that drive these markets, how the contracts are framed and resolved, what news moves the odds, and how a shutdown differs from a debt-ceiling fight. We use these markets as a news signal — a gauge of what Washington-watchers expect — not as a product to trade. Prices are crowd-implied probabilities that can be wrong, and nothing here is financial advice.',
    sections: [
      {
        heading: 'What a federal shutdown actually is',
        body: 'Each fiscal year, which begins October 1, Congress is supposed to pass — and the president sign — 12 annual appropriations bills, one for each Appropriations subcommittee, to fund discretionary government operations. When that funding lapses and no stopgap is in place, affected agencies must, under the Antideficiency Act and the budget framework set under the Antideficiency Act, stop activities not deemed essential to the safety of human life or the protection of property and property. That is a government shutdown.\n\nShutdowns can be full or partial. If all appropriations have lapsed, the disruption is broad; if Congress has already enacted some of the 12 bills, only the agencies left unfunded are affected. Essential personnel — much of the military, air-traffic control, law enforcement — keep working, often without pay until funding resumes, while many other federal employees are furloughed. The practical impact ranges from minor, over a weekend when offices are closed anyway, to severe, when a lapse drags on for weeks.\n\nThis is the core fact a shutdown market is pricing: not whether Congress is fighting, but whether a specific funding deadline passes without a deal, triggering an actual lapse in appropriations for at least part of the government.',
      },
      {
        heading: 'The calendar: appropriations, continuing resolutions, and deadlines',
        body: "Congress rarely finishes all 12 appropriations bills on time. Its standard workaround is a continuing resolution (CR) — a temporary measure that extends funding, usually at the prior year's levels, for a set period while negotiations continue. CRs are routine: Congress has enacted at least one in nearly every fiscal year over the past several decades. Each CR or full-year bill sets a new expiration date, and each of those dates becomes the next potential shutdown trigger — and the next market.\n\nThe recent record shows how this works in practice. The fiscal-year-2026 funding fight produced a 43-day shutdown from October 1 to November 12, 2025 — at the time the longest in U.S. history — which ended when President Trump signed a deal that funded three departments (Agriculture, Military Construction-VA, and the Legislative Branch) for the full year and extended the rest via a CR running to January 30, 2026. That deadline then produced a short partial shutdown from January 31 to February 3, 2026, followed by a longer one from February 14 to April 30, 2026, centered on Department of Homeland Security funding — which surpassed the prior record.\n\nFor anyone reading the odds, the calendar is the spine of the story. The relevant question is always tied to a specific date when funding for some agency expires, so tracking which CR is in force, what it covers, and when it lapses is the first step in making sense of any shutdown market.",
      },
      {
        heading: 'How shutdown markets are framed and how they resolve',
        body: 'A typical contract asks: "Will the U.S. government shut down by [date]?" The price, from 0 to 100 cents (or 0% to 100%), reads as the implied probability of a lapse by that deadline. A contract trading at 35 cents reflects a crowd-implied 35% chance — a money-weighted estimate, not a forecast from any single analyst.\n\nResolution hinges on precise contract language, and the January 2026 episode showed why that wording matters. Both Polymarket and Kalshi contracts generally pointed to an Office of Personnel Management (OPM) announcement of a lapse in appropriations as the verification mechanism, with a hard cutoff time such as 11:59 p.m. ET on the named date. But definitions varied: some contracts treated a partial shutdown as a qualifying "yes," while others were framed around whether the president signed the relevant funding bill by a specific hour. In that fight, funding technically lapsed at midnight on a Saturday while the House was not scheduled to vote until Monday — a brief, low-impact partial lapse that left some contracts ambiguous about whether they should resolve yes.\n\nThe lesson for reading these markets: the headline question and the actual resolution rule are not the same thing. Before treating a price as the odds of a shutdown, check what counts as a shutdown under that specific contract, what time the deadline falls, and which source (typically OPM) is the designated arbiter. Two markets on the "same" event can resolve differently. None of this is a recommendation to trade — it is context for reading the number as a signal.',
      },
      {
        heading: 'What moves the odds',
        body: "Shutdown odds move on the mechanics of the negotiation, not on rhetoric alone. The biggest driver is party control and the math of the Senate, where most funding bills need 60 votes — meaning even a unified majority usually needs votes from the other party. When the two chambers and the White House are split, or when a faction within the majority withholds support, the implied probability of a lapse rises.\n\nSpecific flashpoints move prices fast. The FY2026 fights turned on policy riders unrelated to baseline funding — first a dispute over extending expanded Affordable Care Act subsidies set to lapse at the end of 2025, later a standoff over immigration-enforcement oversight and DHS funding. News of a tentative deal, a scheduled floor vote, or a leadership concession typically pushes odds down; a collapsed negotiation, a missed procedural window, or a hard veto threat pushes them up. The legislative calendar itself matters: chamber rules, such as the House's practice of allowing 72 hours to review a bill, can make a brief lapse near-certain simply because there is no time to vote before a deadline.\n\nFor a news reader, the value of the market is that it aggregates all of this into one moving number. A sharp jump in shutdown odds is often the earliest quantified sign that talks have broken down — but because the crowd can be wrong or can misread an ambiguous contract, the price is a prompt to go read the reporting, not a substitute for it.",
      },
      {
        heading: 'Shutdown vs. debt ceiling: not the same thing',
        body: 'Shutdown markets are frequently confused with debt-ceiling markets, but the two events are distinct. A shutdown is about appropriations — the authority to spend money on discretionary operations. A debt-ceiling crisis is about the Treasury\'s authority to borrow to pay for obligations Congress has already approved. Raising the debt ceiling does not authorize new spending; it lets the government finance commitments already made.\n\nThe stakes differ sharply. A shutdown furloughs workers and pauses non-essential services, but mandatory programs like Social Security and Medicare keep paying, and the disruption is reversible once funding resumes. A failure to raise the debt ceiling risks a default on U.S. obligations — potentially affecting interest payments, benefits, and the broader financial system — which analysts widely describe as far more damaging than a shutdown. The two can overlap in time, and a single budget deal sometimes addresses both, but a market on "will the government shut down" is not a market on "will the U.S. breach the debt ceiling."\n\nWhen reading any funding-related market, confirm which question it is actually asking. The deadlines, resolution sources, and consequences are different, and conflating them is one of the most common errors in interpreting the odds. As always, these prices are crowd-implied probabilities, not predictions or advice.',
      },
    ],
    faq: [
      {
        q: 'What does a government shutdown market mean when it shows 40% odds?',
        a: 'A price of about 40 cents on a "will the government shut down by [date]" contract reads as a roughly 40% crowd-implied probability that a funding lapse will occur by that deadline. It is a money-weighted estimate aggregated from many traders, not a forecast from any single source, and it shifts as news breaks. The crowd can be wrong, and this is a signal to read the underlying reporting, not financial advice.',
      },
      {
        q: 'How do shutdown contracts on Polymarket and Kalshi resolve?',
        a: 'Most resolve based on whether a lapse in appropriations occurs by a stated time, typically 11:59 p.m. ET on the deadline date, using an Office of Personnel Management announcement as the verification source. Definitions vary by contract — some count a partial shutdown as a "yes," others hinge on whether the president signs a funding bill by a specific hour. Always check the exact resolution rules before reading a price as the odds, and remember nothing here is advice.',
      },
      {
        q: 'When is the next government funding deadline?',
        a: "Funding deadlines are set by whatever continuing resolution or appropriations bill is currently in force, so they change as Congress acts. The fiscal-year-2026 cycle saw a continuing resolution run to January 30, 2026, followed by further deadlines tied to short-term Homeland Security funding measures. Check the latest CR's expiration date for the current deadline, as it can move with each new deal.",
      },
      {
        q: 'What is the difference between a government shutdown and the debt ceiling?',
        a: "A shutdown is a lapse in appropriations — the authority to fund discretionary operations — while the debt ceiling concerns the Treasury's authority to borrow to pay obligations Congress has already approved. A shutdown furloughs workers and pauses non-essential services but is reversible; a debt-ceiling breach risks a default that analysts consider far more severe. A market on one is not a market on the other, so confirm which question a contract is asking.",
      },
      {
        q: 'How long was the longest government shutdown?',
        a: 'The October 1 to November 12, 2025 shutdown ran 43 days and was, at the time, the longest in U.S. history. It was later surpassed by a roughly 76-day shutdown that ran from February 14 to April 30, 2026, centered on Department of Homeland Security funding. Shutdown markets often include separate contracts on duration, which resolve on the official count of days a lapse is in effect.',
      },
    ],
    relatedTopics: ['Politics', 'Economics', 'Finance'],
  },
  {
    slug: 'premier-league-odds',
    title: 'Premier League Odds: How Markets Price the Title and Relegation Race',
    h1: 'Premier League Odds: Pricing the Title, Top Five, and Relegation',
    metaDescription:
      'How prediction markets price Premier League odds: the title race, Champions League places, and the three relegation spots, how futures resolve, and what moves the line.',
    intro:
      "The Premier League is English football's top division: 20 clubs, each playing 38 matches across a season that runs from August to May. Three points go to a win, one to a draw, none to a defeat, and the club with the most points at the end is champion. Prediction markets turn the whole table into a set of season-long questions, with the most-traded being who wins the title, who finishes in the European places, and which three clubs are relegated. The prices on those markets are money-weighted estimates of each outcome's probability, not predictions of certainty, and they shift continuously as results, injuries, and transfers reshape the table. This page explains the competition structure, how these futures are priced and how they resolve, what moves the odds, and the calendar that frames the whole thing. None of it is financial or betting advice.",
    sections: [
      {
        heading: "What the Premier League is and how it's structured",
        body: 'The Premier League is contested by 20 clubs. Over a season each club plays every other club twice, once at home and once away, for 38 matches and 380 fixtures in total. A win is worth three points, a draw one, and a loss zero. Final position is decided first by total points; if two clubs are level on points, the standings are separated by goal difference, then goals scored, with further tiebreakers beyond that.\n\nThe table produces several distinct outcomes that markets price separately. The team finishing first is champion. The top places earn entry to UEFA\'s club competitions: in a normal year the top four qualify for the Champions League, but England has at times earned a fifth place through UEFA\'s European Performance Spot, awarded to the associations whose clubs performed best across that season’s European competitions. That fifth place applied in 2025-26, when the top five all reached the Champions League. Places below that feed the Europa League and Conference League, the exact allocation depending on who wins the domestic cups.\n\nAt the bottom, the three lowest-placed clubs are relegated to the EFL Championship, the second tier, and are replaced by three promoted clubs. Relegation carries a large financial gap, which is why the bottom of the table is followed almost as closely as the top, and why "to be relegated" is one of the most active season-long markets.',
      },
      {
        heading: 'How title and relegation futures are priced',
        body: 'A Premier League futures market is a season-long question with a fixed set of outcomes. The title market lists all 20 clubs; traders buy and sell shares in each one, and on a venue like Polymarket a winning share pays out and every other share expires worthless. The price of a club\'s share, between 0 and 1, reads directly as the crowd-implied probability that the club wins, so a share trading at 0.40 reflects roughly a 40% implied chance. Across all 20 clubs the prices sum to about 100%, give or take the spread and trading frictions.\n\nThe same structure covers the other table outcomes. "To finish top four" (or top five in a season with the extra Champions League place), "to qualify for the Champions League," and "to be relegated" each run as their own market, and because more than one club can satisfy them, the implied probabilities across those markets add up to the number of available places rather than to one. Relegation markets typically name every plausible club, with prices clustered on the weakest sides.\n\nThese prices are estimates, not guarantees. They aggregate the money and conviction of many traders, which historically makes them a sharp read on a chaotic competition, but they can be wrong, and they have been: heavily favored clubs have collapsed and longshots have survived. A price near 0.95 still leaves real room for the other outcome. Treat the number as a probability the market is offering, nothing more, and nothing here is advice to trade on it.',
      },
      {
        heading: 'How these markets resolve',
        body: 'Premier League futures resolve on the official final standings. The title market resolves to the club officially crowned champion of that season; on Polymarket\'s 2025-26 title market the stated resolution source is official information from the English Premier League, with a consensus of credible reporting available as a backstop. Relegation and European-place markets resolve the same way, on where clubs actually finish once all 38 rounds are played.\n\nMarkets can also resolve early through mathematical certainty. If a club becomes mathematically unable to win the league, its title share resolves to "No" before the season ends; the same logic settles a relegation share once a club is mathematically down, or safe. This is why a club\'s price can hit 1 or 0 with games still to play, as happened in 2025-26 when Wolves and Burnley were confirmed relegated before the final weekend while the third spot stayed contested.\n\nMarkets usually carry a cancellation or non-completion clause. Polymarket\'s 2025-26 title market specified that if the season were canceled or not completed by a set date, it would resolve to "Other." That clause matters because it defines what happens in the rare case the schedule is not finished, a scenario football has faced before during major disruptions.',
      },
      {
        heading: 'What moves the odds',
        body: "Premier League odds move on new information, and the biggest driver is results. Every matchday redistributes points, and because there are only 38 of them, a single win or loss can swing a title or relegation price sharply, especially late in the season when fewer games remain to recover. Goal difference matters too: when clubs are level on points, it can decide a place, so heavy wins and heavy defeats move the line even when the points gap looks unchanged.\n\nFixtures shape the read between results. A run against the strongest clubs is priced as harder than a run against the bottom of the table, so the same points total can carry a different probability depending on what each club has left. Injuries and suspensions to key players feed in as they are reported, as do managerial changes, which can reset expectations for a struggling side overnight.\n\nTransfers are the other major input, concentrated in the two windows. A marquee signing or a key departure changes a club's projected strength, and markets often react before a deal is even confirmed, on credible reporting. Around deadline day, relegation and top-five prices can move repeatedly as squads are reshaped. The pattern over a season is that prices are widest before kickoff, when the most is unknown, and tighten as the table fills in and outcomes become clearer.",
      },
      {
        heading: 'The season calendar that frames the markets',
        body: 'The Premier League season runs roughly from mid-August to late May, and that calendar is the backbone of every futures market. The 2025-26 season started on 15 August 2025 and finished on 24 May 2026, with Arsenal champions on 85 points ahead of Manchester City and Manchester United; Wolves, Burnley, and West Ham were the three relegated clubs. The 2026-27 season starts later than usual, on 22 August 2026, with the final round on 30 May 2027, the later opening built in to give players recovery time after the 2026 World Cup.\n\nThe final day is the single most important date for these markets. Every last-round fixture kicks off at the same time, so the title, the European places, and the relegation spots can all settle within the same 90 minutes, which is why prices on contested outcomes stay live until then. In 2025-26 the third relegation place was still undecided going into that simultaneous final round.\n\nTwo transfer windows punctuate the season. The summer window runs through the off-season into early September; for 2026 it opened on 15 June and closes on 1 September 2026. A shorter winter window runs in January, opening on 1 January and closing on 1 February 2027. Each window is a period when squad strength, and therefore the odds, can change quickly, so markets tend to be more active around them. Dates can be adjusted by the league, so check the official schedule before relying on a specific one, and remember that none of this is financial advice.',
      },
    ],
    faq: [
      {
        q: 'How many teams are relegated from the Premier League each season?',
        a: 'Three. The clubs finishing in the bottom three of the 20-team table at the end of the season are relegated to the EFL Championship, the second tier, and are replaced by three promoted clubs. In 2025-26 the three relegated clubs were Wolves, Burnley, and West Ham. Prediction-market relegation prices are crowd-implied probabilities of finishing in that bottom three, not guarantees, and nothing here is betting advice.',
      },
      {
        q: 'How do Premier League title odds work on prediction markets?',
        a: "The title market lists all 20 clubs, and traders buy shares in each; the winning club's shares pay out while the rest expire worthless. A club's share price, between 0 and 1, reads as the market's implied probability that it wins the league, and the prices across all clubs sum to roughly 100%. These are estimates from aggregated trading, can be wrong, and are not financial advice.",
      },
      {
        q: 'How many Champions League spots does the Premier League get?',
        a: "Usually four, going to the top four finishers. In some seasons England earns a fifth Champions League place through UEFA's European Performance Spot, which rewards the associations whose clubs performed best in Europe that same season; that fifth place applied in 2025-26, so the top five all qualified. Whether it applies in a given season depends on UEFA's coefficients, so check the current rules rather than assuming.",
      },
      {
        q: 'When does the Premier League season start and end?',
        a: 'The season runs roughly from mid-August to late May, spanning 38 matchdays. The 2025-26 season ran from 15 August 2025 to 24 May 2026, and the 2026-27 season is set to start on 22 August 2026 and finish on 30 May 2027, with a later start built in around the 2026 World Cup. The league can adjust dates, so confirm against the official schedule.',
      },
      {
        q: 'What makes Premier League odds move during the season?',
        a: 'Results are the main driver, since each of the 38 matchdays redistributes points and can swing a price sharply, with goal difference and remaining fixtures adding to the read. Injuries, suspensions, managerial changes, and transfer activity in the summer and January windows also move the line as new information arrives. Odds are typically widest before kickoff and tighten as the table fills in; none of this is a recommendation to trade.',
      },
    ],
    relatedTopics: ['Sports', 'Soccer', 'Finance'],
  },
  {
    slug: 'ai-agi-odds',
    title: 'AGI Odds: How Prediction Markets Price When AI Reaches AGI',
    h1: 'AGI Odds: How Markets Price the Race to General AI',
    metaDescription:
      'AGI odds explained: how prediction markets price when AI reaches artificial general intelligence, how these markets resolve, and why the definition is contested.',
    intro:
      '"AGI odds" refers to the prices on prediction markets that estimate when, or whether, artificial general intelligence will arrive — and they are among the most-watched and most-argued numbers in tech. Platforms like Polymarket and Kalshi list contracts such as "OpenAI announces it has achieved AGI before 2027," and forecasting sites like Metaculus run longer-horizon questions on when the first general AI system will be publicly announced. The appeal is obvious: a single price seems to compress thousands of expert opinions into one probability. The problem is just as obvious once you look closely — there is no agreed definition of AGI, so what each market is actually asking varies widely, and the resolution criteria do most of the work. This page explains what these markets ask, how they are framed and resolved, what news moves the odds, and why the definitional ambiguity means any AGI price should be read with unusual care. None of this is financial advice.',
    sections: [
      {
        heading: 'What "AGI odds" markets actually ask',
        body: 'There is no single AGI market. Instead there is a family of contracts, and they ask very different questions despite sharing the same three letters.\n\nThe most common type is a milestone-announcement market tied to a specific lab and a deadline. On Polymarket, for example, "OpenAI announces it has achieved AGI before 2027?" resolves to Yes only if OpenAI or an official representative states that it has created AGI by the end of 2026. Kalshi runs a parallel contract on whether OpenAI announces AGI by December 31, 2026. Note what these markets actually price: not whether AGI exists in some philosophical sense, but whether a particular company publicly declares it within a window. A model could be transformative without anyone calling it "AGI," or a company could use the term loosely — the contract only tracks the announcement.\n\nA second type is a dated-forecast question, most associated with Metaculus rather than a money market. Its long-running question on "when the first general AI system will be devised, tested, and publicly announced" attaches a concrete checklist — passing adversarial Turing-style tests, scoring well on broad exams, and completing certain tasks — so the resolution is far more demanding than a press release. As of early 2026 that community forecast pointed to the early 2030s, with a wide range, after forecasters pushed their timelines later through 2025 and 2026.\n\nA third type prices the competitive race rather than the finish line: "which company has the best AI model" by a given date. These are not AGI markets at all, but they sit in the same category and often move on the same news.',
      },
      {
        heading: 'How these markets resolve',
        body: 'Resolution is where AGI markets live or die, because the term itself carries no fixed meaning. A money market on Polymarket or Kalshi resolves on an observable event — almost always a public announcement — rather than on whether a model is "truly" general. For the OpenAI contracts, the primary resolution source is official information from OpenAI or its representatives, with a consensus of credible reporting used as a backstop. If the named company has not made the announcement by the deadline, the market resolves No.\n\nThis design is deliberate. An observable, reportable trigger can be adjudicated; a contested abstraction like "human-level intelligence" cannot. The trade-off is that the market answers a narrower question than the headline suggests. "Will OpenAI announce AGI by 2027" depends partly on capability and partly on corporate and legal incentives to use the word at all.\n\nThose incentives are not hypothetical. Reporting on the Microsoft–OpenAI partnership described an internal, contractual definition that reportedly tied AGI to a profit threshold — figures around $100 billion in profits have been cited — because the label carried real consequences for the two companies\' rights. Whether or not that specific framing still governs the relationship, it shows how far a working definition of AGI can sit from any benchmark a researcher would recognize. When you read an AGI price, read the market\'s Rules tab first: the resolution source and the exact deadline matter more than the word "AGI" in the title.',
      },
      {
        heading: 'The core problem: AGI has no agreed definition',
        body: 'Every AGI odds figure rests on a definition that the field has never settled, and this is the single most important caveat. Some use AGI to mean a system that matches or exceeds humans across most economically valuable cognitive work. Others mean a system that can learn any new task as efficiently as a person. The Microsoft–OpenAI context reportedly used a financial threshold. Each definition implies a different market, a different resolution date, and a different probability.\n\nBenchmarks illustrate the gap rather than closing it. The ARC-AGI test, created by François Chollet in 2019 to measure the ability to generalize to genuinely novel tasks, became a focal point when OpenAI\'s o3 model reportedly scored roughly 87% on the first version (ARC-AGI-1) in late 2024 — a result Chollet called a significant step-function increase. But the harder ARC-AGI-2, released in 2025, saw top scores fall sharply, and an interactive ARC-AGI-3, introduced in 2026, reportedly left frontier models near zero while humans solved its tasks. Strong performance on one benchmark plainly does not equal AGI, and the benchmarks themselves keep moving as systems improve.\n\nThe practical consequence: two markets can show very different AGI odds and both be internally consistent, because they are not asking the same thing. A near-term lab-announcement contract can look frothy while a strict, checklist-based forecast points years further out. Treat any AGI probability as conditional on its specific resolution criteria, not as a reading of "how close we are" in the abstract.',
      },
      {
        heading: 'What moves the odds',
        body: 'AGI and AI-leadership markets react to a fairly predictable set of inputs, even if the magnitude of each move is hard to call in advance.\n\nModel releases are the biggest driver. A new frontier model, especially one with a step-change on reasoning or agentic tasks, can swing both the milestone markets and the "best model" race quickly. In June 2026, for instance, a frontier release reshaped the "best AI model" market, with the crowd concentrating around a single leader and tens of millions of dollars trading on the question. Benchmark results move odds in the same way — a surprising jump (or a flat result) on tests like ARC-AGI, broad exams, or coding and agent evaluations is read as evidence about the trajectory.\n\nLab and executive statements matter because the milestone contracts resolve on announcements. Public comments from figures like Dario Amodei and Demis Hassabis are watched closely; reported timelines have ranged from "a few years" to "five to ten years," and notably, several prominent forecasters lengthened their AGI timelines during 2025–2026 rather than shortening them. Independent forecasts such as the AI 2027 scenario, and later revisions pushing key thresholds toward the early 2030s, feed the same debate.\n\nFinally, liquidity and attention move prices in ways unrelated to capability. Monthly volume on AI markets has fluctuated and at points declined through 2026, and thin markets can produce noisy odds. A small number of large traders can move a quiet contract, so a price is only as informative as the volume and the time left to resolution behind it.',
      },
      {
        heading: 'Reading AGI odds without overreading them',
        body: 'A prediction-market price is a money-weighted estimate of probability — useful precisely because participants have something at stake — but on a contested, long-horizon question like AGI, several limits apply at once.\n\nFirst, the price answers the resolution criteria, not the headline. "40% chance of AGI by year X" almost always means "40% chance a named entity makes a specified announcement by a specified date," which is narrower and more announcement-driven than the phrase suggests.\n\nSecond, crowd-implied probabilities can be wrong, and they are wrong more often on novel, hard-to-verify questions than on, say, an election with a fixed counting date. There is no historical base rate for "AGI by 2027," so the market is aggregating opinion about an unprecedented event, not pricing a well-understood frequency.\n\nThird, time and liquidity shape the number. Far-dated contracts carry large uncertainty and can be moved by a single release; thin markets can drift on low volume. The honest way to use AGI odds is as one input among many — a snapshot of where informed money sits today, alongside benchmark results, lab statements, and independent forecasts — rather than as a settled probability. We report these prices as a signal of what the crowd believes; we do not treat them as predictions you should act on, and nothing here is financial advice.',
      },
    ],
    faq: [
      {
        q: 'What are the current odds of AGI by 2027?',
        a: "Odds vary by platform because each market asks a different question. The most common money-market contracts, such as Polymarket's and Kalshi's OpenAI markets, price whether OpenAI publicly announces AGI by the end of 2026, not whether AGI broadly exists. Longer-horizon forecasts like Metaculus pointed to the early 2030s as of early 2026. Always check a market's exact resolution date and source, and remember these are crowd-implied estimates, not advice.",
      },
      {
        q: 'How do AGI prediction markets decide who is right?',
        a: 'Money markets resolve on an observable trigger, almost always a public announcement by a named lab, judged against the market\'s stated resolution source — typically official statements plus a consensus of credible reporting. If the announcement does not happen by the deadline, the market resolves No. They do not resolve on whether a model is "truly" general, because that has no agreed test. Read the Rules tab before reading the price.',
      },
      {
        q: 'Why is there no single definition of AGI?',
        a: 'Different groups mean different things: matching humans across most cognitive work, learning any new task as efficiently as a person, or, in some corporate contexts, hitting a financial threshold. Each definition implies a different market and a different resolution date, so two AGI odds figures can disagree and both be valid. This ambiguity is the main reason to treat any AGI probability with care. Nothing about a market price settles the definition.',
      },
      {
        q: 'What is the ARC-AGI benchmark and does passing it mean AGI?',
        a: "ARC-AGI is a test created by François Chollet in 2019 to measure how well a system generalizes to genuinely novel reasoning tasks. OpenAI's o3 reportedly scored about 87% on the first version in late 2024, but harder later versions (ARC-AGI-2 in 2025 and ARC-AGI-3 in 2026) saw frontier scores fall sharply. A high score on one benchmark is evidence of progress, not proof of AGI, and the benchmarks keep evolving.",
      },
      {
        q: 'What moves AGI odds the most?',
        a: 'Frontier model releases and benchmark results are the biggest drivers, followed by statements from labs and executives, since the milestone markets resolve on announcements. Independent forecasts and shifts in expert timelines also move prices — notably, several forecasters lengthened their AGI timelines during 2025 and 2026. Thin liquidity can move quiet markets too, so judge a price alongside its volume. These are signals to weigh, not financial advice.',
      },
    ],
    relatedTopics: ['Science and Technology', 'Finance', 'Economics'],
  },
  {
    slug: 'champions-league-odds',
    title: 'Champions League Odds: How UEFA Champions League Winner Markets Work | Crowdtells',
    h1: 'Champions League Odds',
    metaDescription:
      'How UEFA Champions League winner odds work: the 36-team league phase, knockout bracket, how outright futures resolve, and what moves the prices through the season.',
    intro:
      'The UEFA Champions League is European club football\'s top competition, and "Champions League odds" usually means the outright market on which club will lift the trophy. On prediction markets like Polymarket and Kalshi, those odds are money-weighted probability estimates: the price on a club is roughly the crowd\'s implied chance it wins the final. This page explains how the competition is structured since its 2024-25 redesign, how outright winner futures are priced and how they resolve, what news and results move the numbers, and the autumn-to-spring calendar that drives the trading. We do not name a current favorite, because the leader and the prices change with every matchday and draw, so check a live market for the latest. Nothing here is financial advice, and crowd-implied probabilities can be and often are wrong.',
    sections: [
      {
        heading: 'The competition format: a 36-club league phase, then a knockout to one final',
        body: 'Since the 2024-25 season the Champions League runs on a single league phase, sometimes called the "Swiss model," rather than the old eight groups of four. Thirty-six clubs sit in one combined standings table. Each club plays eight different opponents across eight matchdays, four at home and four away, drawn from four seeding pots so every team faces two opponents from each pot. Points are the familiar three for a win and one for a draw.\n\nAfter the eight matchdays, the table decides who advances. The top eight clubs qualify directly for the round of 16. Clubs finishing 9th through 24th drop into a two-legged knockout playoff round, and the winners of those ties join the round of 16. Clubs placed 25th to 36th are eliminated from European competition for that season, with no parachute into the Europa League.\n\nFrom the round of 16 onward the competition is a straight knockout bracket: round of 16, quarter-finals, and semi-finals are each played over two legs, home and away. The final is a single match at a neutral, pre-selected venue. The club that wins the final is the champion, and that result is what an outright winner market pays out on.',
      },
      {
        heading: 'How outright winner futures are priced',
        body: 'An outright "who wins the Champions League" market lists every club still able to win and assigns each a price. On a prediction market that price reads directly as an implied probability: a club trading at 0.20 reflects a roughly 20% crowd-implied chance of winning the trophy. Because all live outcomes must together account for the full field, the implied probabilities across all clubs sum to more than 100%; the excess is the market\'s built-in margin or "overround," so a single club\'s raw price slightly overstates its true modeled chance.\n\nPrices move continuously as traders weigh squad strength, recent form, the draw, and the path each club faces to the final. A team with an easier projected bracket can be priced higher than a stronger team set up for a harder route. Early in the season the field is wide and probabilities are spread thinly across many clubs; as the bracket narrows, probability concentrates on the survivors and the remaining prices rise toward resolution.\n\nTreat any single price as a snapshot of crowd opinion at one moment, not a forecast that is guaranteed to be right. Markets misprice favorites and longshots regularly, especially in a knockout competition where a single tie can end a campaign. Specifics here go stale quickly, so always check a live market for the current numbers.',
      },
      {
        heading: 'How the market resolves',
        body: 'An outright Champions League winner market resolves to the club that wins the final. There is one decisive match, so resolution is clean: the team that lifts the trophy is the "Yes," every other club is "No," and the market settles after the final whistle (including any extra time or penalties).\n\nThe knockout rounds before the final are decided on aggregate over two legs, the combined score across both matches. If a tie is level on aggregate after the second leg, it goes to two 15-minute periods of extra time and, if still level, a penalty shoot-out. The away-goals rule was abolished from 2021-22, so goals scored away no longer break a tie; only total goals, then extra time, then penalties, decide who advances. The single-match final follows the same logic without aggregate: if the score is level after 90 minutes, extra time is played, and a penalty shoot-out settles it if needed.\n\nUEFA is the resolution source. The official result UEFA records as the final\'s winner is what the outright market pays out on, regardless of how the match was won. Always read a specific market\'s rules text, since wording on edge cases (abandonments, sanctions, a club withdrawing) is set by the platform listing the contract.',
      },
      {
        heading: 'What moves the odds',
        body: "The draw is one of the largest single movers. The league-phase draw and, later, the knockout bracket draw set each club's opponents and projected path, and prices reprice the moment a club is handed an easier or harder route to the final.\n\nResults and form move odds matchday to matchday. A run of wins in the league phase lifts a club's seeding and its chance of a top-eight finish that skips the extra playoff round; a stumble can push it toward 9th-24th and a more dangerous path. In the knockouts, a strong first leg can swing a club's win probability sharply before the return match.\n\nInjuries, suspensions, and squad availability matter, particularly around two-legged ties when a key player is doubtful. Manager changes, fixture congestion from domestic leagues and cups, and even rotation decisions for less important games all feed in. Liquidity and attention spike around matchdays and draw days, which is when prices tend to move most. Because these inputs shift constantly, any odds you see are an \"as of\" reading rather than a fixed call.",
      },
      {
        heading: 'The calendar and cadence',
        body: 'The Champions League runs autumn to spring. The league phase plays across eight matchdays from mid-September into late January, typically grouped in midweek clusters about every two to three weeks, with a gap over the winter holidays before the final matchdays in January.\n\nThe knockout calendar follows in the new year. The knockout-phase playoff round (for clubs that finished 9th-24th) is played in February; the round of 16 follows in March, the quarter-finals in April, and the semi-finals across late April and early May. The single final is held at a neutral venue in late May or early June, with the host stadium chosen years in advance.\n\nFor trading, the rhythm is predictable even though the outcomes are not. Outright prices are most active around the league-phase and knockout draws and around each two-legged tie, then converge as the field shrinks toward the final. Exact dates and the final venue change every season, so confirm the current schedule and check a live market before relying on any number. Nothing here is financial advice.',
      },
    ],
    faq: [
      {
        q: 'How do Champions League odds work?',
        a: "Champions League odds are an outright market on which club will win the trophy. On prediction markets, a club's price reads as a crowd-implied probability of winning the final, so a price near 0.25 means roughly a 25% implied chance. The prices across all clubs add up to more than 100% because of the market's built-in margin, and they shift with results, the draw, and injuries. They are estimates that can be wrong, not guarantees.",
      },
      {
        q: 'How does the new 36-team Champions League format work?',
        a: 'Since 2024-25 the competition uses a single league phase of 36 clubs in one table instead of eight groups. Each club plays eight different opponents, four home and four away, over eight matchdays. The top eight go straight to the round of 16, clubs 9th-24th enter a two-legged knockout playoff, and clubs 25th-36th are eliminated. The survivors then play a knockout bracket to a single final.',
      },
      {
        q: 'How does a Champions League winner market resolve?',
        a: 'It resolves to the club that wins the final, the single decisive match. Whichever team UEFA records as the winner, including a result settled in extra time or on penalties, pays out as the "Yes" outcome, and every other club settles as "No." The market settles after the final is over. Always read the specific platform\'s rules for edge cases like abandonments or withdrawals.',
      },
      {
        q: 'Is there still an away goals rule in the Champions League?',
        a: 'No. UEFA abolished the away-goals rule from the 2021-22 season. In the two-legged knockout rounds the winner is the club with the higher aggregate score; if the aggregate is level after both legs, two periods of extra time are played, and a penalty shoot-out decides it if still level. Away goals no longer break a tie.',
      },
      {
        q: 'When is the Champions League final?',
        a: 'The final is a single match held at a neutral, pre-selected venue in late May or early June, closing a season that runs from the September league phase through the spring knockout rounds. The host stadium is chosen by UEFA years in advance. The exact date and venue change every season, so check the current schedule for the year you are looking at.',
      },
    ],
    relatedTopics: ['Soccer', 'Sports'],
  },
  {
    slug: 'presidential-approval-odds',
    title: 'Presidential Approval Rating Odds: How Prediction Markets Price Job Approval',
    h1: 'Presidential Approval Rating Odds',
    metaDescription:
      'How prediction markets price presidential approval rating odds: what approval measures, how poll aggregators set the number, how markets resolve, and what moves it.',
    intro:
      'A presidential approval rating is the share of the public that says it approves of how the president is handling the job, measured by pollsters and combined into an average by aggregators. Because that number is published on a regular cadence and tied to a named source, it is something prediction markets can price: traders buy and sell contracts on where the approval figure will sit on a given date, or whether it will move above or below a threshold. This page explains what the approval rating is, how markets on Polymarket and Kalshi frame it, the specific aggregator and rule each market resolves on, and the news and economic data that tend to move the number. It treats approval as a recurring, time-bound metric rather than a single result. Prices here are crowd-implied probabilities that can be wrong, and nothing on this page is financial advice.',
    sections: [
      {
        heading: 'What a presidential approval rating actually measures',
        body: 'Approval rating is a single, well-defined survey statistic: the percentage of respondents who say they approve of the way the president is handling the job. The standard question, used in roughly its current form since the Truman era, is some version of "Do you approve or disapprove of the way [the president] is handling his job as president?" Pollsters put that question to a sample of adults, then report the approve and disapprove shares. The two figures usually do not sum to 100 percent because some respondents are unsure.\n\nGeorge Gallup began tracking presidential approval around 1937, and for decades Gallup\'s number was the reference point. That role has shifted: on February 11, 2026, Gallup announced it would stop polling presidential approval after about 88 years. Today the headline "approval rating" most people cite is not a single poll but an average of many polls, which smooths out the noise of any one survey. Statisticians generally treat a well-built aggregate as a valid indicator of how the national mood is changing over time, even though any individual poll can miss.\n\nApproval is inherently time-bound. It is a snapshot of sentiment at a moment, and it moves continuously as new polls come in. That is exactly what makes it tradable: there is a fresh, public number on a regular cadence, attached to an identifiable source.',
      },
      {
        heading: 'How prediction markets frame approval markets',
        body: 'Because approval is a published number rather than a yes/no event, markets have to pin down which number and which moment. They do this in a few recurring formats. The most common is a point-in-time market: "What will the president\'s approval rating be on [date]?" with the outcomes split into narrow brackets, for example sub-43.5%, 43.5 to 43.9%, 44.0 to 44.4%, and so on up to a top bracket. Each bracket is a separate contract, and the price of each is the market\'s implied probability that the aggregate lands in that range on the resolution date.\n\nA second format is the threshold or season-long market: "How low (or how high) will approval go this year?" These resolve Yes for a given level — say 40% or below, 35% or below, 30% or below — if the aggregate ever touches that level at any point in the window. A third, shorter-horizon format asks whether approval will be up or down versus the prior reading over a fixed period, often a single week.\n\nAcross all of these, the contract is not a wager on a person so much as a money-weighted estimate of a future statistic. The bracket prices, read together, form an implied probability distribution over where the number will be. As of writing, the most active approval markets track the sitting U.S. president, but the same mechanics apply to any leader whose approval an aggregator publishes.',
      },
      {
        heading: 'How approval markets resolve: the named source and rule',
        body: "The single most important detail in any approval market is the resolution source, because \"the approval rating\" only has one value once you name the aggregator. On Polymarket, recent presidential approval markets resolve to Silver Bulletin's approval-rating aggregator — specifically the value shown by the green trend line for the resolution date — with RealClearPolitics named as the fallback if Silver Bulletin's number becomes permanently unavailable. The aggregate is read to one decimal place (for example 43.8%), and the brackets are written to match that precision.\n\nResolution also depends on when a number is considered final. Aggregators update continuously, so markets typically treat a given day's figure as finalized once the next data point is published. Markets also include a deadline rule: if the figure for the resolution date is not posted by a stated cutoff, resolution falls back to the most recent available data points. Always read a specific market's rules, since the named source, the exact line on the chart, the rounding, and the cutoff time are what determine the outcome — not a number you might see quoted elsewhere.\n\nThis is why two markets that look identical can settle differently: one might key off Silver Bulletin's aggregate and another off RealClearPolitics, and those two averages can differ by a point or more at the same moment because they include different polls and weight them differently.",
      },
      {
        heading: 'What moves the odds',
        body: 'Approval markets reprice as the underlying average moves, and the average moves with the news. The most durable, slow-moving driver is the economy. Over long horizons, conditions like unemployment and inflation tend to track with approval, though the short-term link is noisier than people assume and not every study finds a strong effect. Sharp prints in inflation, jobs, or growth, and the cost-of-living mood they create, can pull the average over weeks.\n\nDiscrete events move it faster. New presidents usually start with an elevated "honeymoon" number that drifts down over their first months, so early-term markets often price a gradual decline. International crises can produce a rally-round-the-flag jump, where approval rises sharply during a national-security event — the clearest example being George W. Bush, whose approval spiked to roughly 90% after the September 11, 2001 attacks, the highest ever recorded. Such rallies are usually temporary and fade. In the other direction, scandals, legislative fights, and unpopular policy decisions can erode the number.\n\nFor traders, the calendar matters: aggregates update on a regular cadence, and each new batch of polls can shift a tight bracket. Because the markets resolve on a specific reading on a specific date, short-term volatility in the average — not just the long-run trend — drives how the brackets are priced. Treat any single live price as a probability, not a forecast of certainty; crowds can be confidently wrong, especially around one-off events that polls have not yet captured.',
      },
      {
        heading: 'Reading approval odds as news, not as a tip',
        body: "The value of an approval market, from a news standpoint, is the implied probability it puts on a level being reached — for instance, the market's odds that the aggregate falls below 40% this year, or that it sits in a given band on a fixed date. That figure is a fast, money-weighted read on where informed traders think sentiment is heading, and it often moves before the next batch of polls is public.\n\nIt is still an estimate. The market can only be as good as the polls feeding the aggregator, and aggregates carry their own house effects and lag. A bracket priced at 70% is not a promise; it means the crowd, after weighing the available evidence, assigns roughly a 70% chance. Surprises — a sudden crisis, an economic shock, a scandal — can move both the underlying number and the odds quickly.\n\nCrowdtells reads these markets as a signal of what to report on, then briefs the actual news behind the move with real sourcing. Use the odds to gauge how the public mood is trending and which way risk is leaning; for the precise current number, check a live market and the named aggregator directly. None of this is financial advice.",
      },
    ],
    faq: [
      {
        q: 'What is a presidential approval rating?',
        a: 'It is the percentage of people in a poll who say they approve of how the president is handling the job, based on a question like "Do you approve or disapprove of the way the president is handling his job?" The approve and disapprove shares usually do not add to 100% because some respondents are unsure. The widely cited "approval rating" is typically an average of many polls rather than a single survey.',
      },
      {
        q: 'How do prediction markets on approval ratings resolve?',
        a: "They resolve to a named poll aggregator's published number on a specific date. On Polymarket, recent presidential approval markets resolve to Silver Bulletin's aggregator — the value of its green trend line on the resolution date — with RealClearPolitics as the fallback if that source becomes unavailable. The figure is read to one decimal place and a day's number is treated as final once the next data point is published.",
      },
      {
        q: 'What is the difference between Silver Bulletin and RealClearPolitics approval averages?',
        a: 'Both combine many individual polls into a single approval figure, but they include different polls and weight them differently, so their numbers can differ by a point or more at the same moment. That is why the resolution source named in a market matters: "the approval rating" only has one value once you specify which aggregator is being used. Always read the market\'s rules to see which source governs.',
      },
      {
        q: "What makes a president's approval rating go up or down?",
        a: 'Over the long run, economic conditions like unemployment and inflation tend to track with approval, though the short-term link is noisy. Discrete events move it faster: new presidents enjoy an elevated "honeymoon" that fades, international crises can cause a temporary rally-round-the-flag jump, and scandals or unpopular decisions tend to pull it down. George W. Bush\'s approval reached about 90% after the September 11, 2001 attacks, the highest ever recorded.',
      },
      {
        q: 'Are approval rating odds reliable?',
        a: 'They are a crowd-implied probability estimate, not a guarantee. The odds can only be as good as the polls feeding the aggregator, and aggregates carry their own lag and house effects, so the market can be confidently wrong — especially around sudden events polls have not yet captured. Read a price like 70% as roughly a 70% chance, and treat the markets as a signal of sentiment rather than as financial advice.',
      },
    ],
    relatedTopics: ['Politics', 'US Election', 'Economics'],
  },
  {
    slug: 'stock-market-crash-odds',
    title: 'Stock Market Crash Odds: How Prediction Markets Price a Crash or Correction',
    h1: 'Stock Market Crash & Correction Odds',
    metaDescription:
      'How prediction markets price the odds of a stock market crash, correction, or bear market in the S&P 500 — what the contracts measure, how they resolve, and what moves them.',
    intro:
      'A "stock market crash" sounds like one thing, but in markets it covers several distinct events with different thresholds. A correction is a decline of 10% or more from a recent high; a bear market is a fall of 20% or more; a crash usually means a sudden, sharp drop, with no single official percentage attached. Prediction markets such as Kalshi and Polymarket turn these into yes/no contracts — for example, "will the S&P 500 fall X% by date Y" or "will the index close below a set level" — and the price of each contract reads as a crowd-implied probability. This page explains what those contracts measure, how they resolve, and what kind of news and data tend to move the odds. Throughout, treat the numbers as money-weighted estimates that can be wrong, not as forecasts, and not as financial advice.',
    sections: [
      {
        heading: 'Correction, bear market, crash: the terms defined',
        body: 'These words get used loosely, but the standard definitions are specific, and the difference matters when you read a contract.\n\nA correction is a drop of 10% or more (but less than 20%) from a recent peak. Corrections are fairly routine; the S&P 500 has had many since 2000, and they have historically lasted on the order of a few months before recovering. A bear market is a decline of 20% or more from the high — less frequent, and usually longer-lived than a correction.\n\nA crash is the loosest term of the three. It describes the speed of a fall — a sudden, steep drop, often over days rather than months — rather than a fixed percentage. There is no official crash threshold, which is exactly why prediction markets do not trade a contract literally called "crash." Instead they pin down a measurable event: a specific percentage decline, or the index closing above or below a defined level, by a stated date. When you see crash odds quoted, what\'s really being priced is one of those precise, resolvable contracts.',
      },
      {
        heading: 'How prediction markets turn a crash into a tradable contract',
        body: 'Prediction markets express probability through price. Each contract is binary: it pays $1 if the stated event happens and $0 if it doesn\'t, and it trades somewhere between a few cents and 99 cents in between. The price is the implied probability — a contract trading at 30 cents reads as roughly a 30% crowd-implied chance, and a contract at 8 cents reads as roughly 8%.\n\nFor the stock market, the underlying is almost always a benchmark index, most often the S&P 500. A contract phrases the question precisely: "will the S&P 500 close below [level] on [date]?", "will the S&P 500 fall [X]% from its high by [date]?", or "what range will the index close in at year-end?" Because the contract is tied to a published index level and a fixed deadline, the vague idea of a "crash" becomes something that can be settled with a number.\n\nA price near 50 cents signals genuine disagreement — the market sees the outcome as close to a coin flip. A price in the low single-digit cents means the crowd is collectively treating that decline as unlikely on the stated horizon, though "unlikely" is not "impossible," and these prices move.',
      },
      {
        heading: 'How these markets resolve',
        body: "Resolution is the rule that decides which side gets paid, and it is the most important part of any contract to read before you trust the headline odds.\n\nOn an index market, resolution comes down to comparing the official index value against the contract's threshold at a defined moment. A typical S&P 500 contract resolves on the index's closing level on a specific date — for instance, whether the close on a year-end date is above or below a set number — read from a named reference source. Kalshi's markets settle when its markets team confirms the resolution criteria have been met against that verification source; a market staying open is not itself a signal about the outcome. Payout follows shortly after: $1 to the correct side, $0 to the other.\n\nTwo details trip people up. First, most index contracts resolve on a closing level, not on an intraday low — a market can plunge during the day and recover by the close, and only the close counts if that's what the rule specifies. Second, \"fall X% from a recent high\" requires the contract to define both the peak it measures from and the deadline. Always read the specific rules and the resolution source on the contract page rather than assuming; thresholds, dates, and reference sources differ from one market to the next.",
      },
      {
        heading: 'What moves the odds',
        body: 'Crash and correction odds are not driven by a single number. They respond to a shifting mix of macro signals, and the prices tend to react fast to news.\n\nInterest rates and Federal Reserve policy are central. Higher rates raise borrowing costs and lower the present value of future earnings, which weighs on stock prices; expectations of rate cuts or hikes can move odds before any decision is made. Recession signals matter too: an inverted yield curve — when short-term yields rise above long-term yields — has preceded most U.S. recessions historically and is widely read as a warning, and stocks often weaken ahead of a downturn as investors anticipate it.\n\nCorporate earnings and forward guidance set the floor under valuations; broad disappointments can trigger repricing. Sudden shocks — geopolitical conflict, a banking scare, a policy surprise — can spike crash odds within hours. And volatility itself is a tell: the VIX, the CBOE index of expected 30-day S&P 500 volatility often called the "fear gauge," tends to jump when stocks plunge and investors buy protection. A rising VIX usually coincides with rising crash-contract prices, because both reflect the same growing demand for downside insurance. Note the VIX measures the expected size of moves, not their direction.',
      },
      {
        heading: 'Reading the odds without overreading them',
        body: 'A prediction-market price is a useful, real-money-weighted snapshot of what the crowd currently thinks — but it is an estimate, not a forecast, and it is not advice.\n\nThree caveats are worth holding onto. First, low-probability events still happen; a contract at 5 cents is the market saying "unlikely," and unlikely things occur regularly across many markets. Second, these prices change continuously as news arrives, so any figure is only true "as of" the moment you read it — check a live market rather than relying on a number you saw days ago. Third, thinner markets can be noisy or distorted by a few large trades, so a single quoted price is more reliable when volume is high and the contract is widely traded.\n\nUsed well, crash and correction odds are a fast way to gauge how seriously the market is taking downside risk right now, and how that fear is rising or fading as rates, earnings, and headlines shift. They are a signal to read, not a call to act on.',
      },
    ],
    faq: [
      {
        q: 'What is the difference between a market correction, a bear market, and a crash?',
        a: 'A correction is a decline of 10% or more (but under 20%) from a recent high, and these are fairly common and usually short-lived. A bear market is a fall of 20% or more, which is less frequent and tends to last longer. A crash describes the speed of a drop — a sudden, sharp fall — and has no single official percentage threshold, which is why prediction markets price specific, measurable contracts instead.',
      },
      {
        q: 'How do prediction markets price the odds of a stock market crash?',
        a: "They use binary yes/no contracts tied to a benchmark like the S&P 500 — for example, whether the index falls a set percentage or closes below a defined level by a stated date. Each contract pays $1 if the event happens and $0 if it doesn't, and its current price (in cents) reads directly as the crowd-implied probability. A contract at 20 cents implies roughly a 20% chance as of that moment.",
      },
      {
        q: 'How does a Kalshi S&P 500 market resolve?',
        a: "It compares the official index value against the contract's threshold at a defined time, usually a closing level on a specific date, read from a named reference source. Kalshi's markets team confirms the criteria are met before settling, paying $1 to the correct side and $0 to the other. Most index contracts resolve on the close, not an intraday low, so always read the specific rules on the contract page.",
      },
      {
        q: 'What moves stock market crash odds?',
        a: 'Interest-rate expectations and Federal Reserve policy, recession signals such as an inverted yield curve, corporate earnings and guidance, and sudden shocks like geopolitical or financial scares all move the odds. Market volatility is also a tell: the VIX, which measures expected 30-day S&P 500 volatility, tends to spike when stocks plunge, and crash-contract prices usually rise alongside it.',
      },
      {
        q: 'Are prediction market crash odds reliable?',
        a: 'They are a real-money-weighted estimate of what the crowd currently thinks, which makes them a useful signal, but they can be wrong and are not a forecast or financial advice. Low-probability events still occur, prices change constantly as news arrives, and thinly traded markets can be noisy. Treat any figure as true only "as of" the moment you read it, and check a live market for the current price.',
      },
    ],
    relatedTopics: ['Finance', 'Economics', 'Politics', 'Crypto'],
  },
  {
    slug: 'next-fed-chair-odds',
    title: 'Next Fed Chair Odds: Who Leads the Federal Reserve | Crowdtells',
    h1: 'Next Fed Chair Odds',
    metaDescription:
      'Track next Fed Chair odds: how prediction markets price who leads the Federal Reserve, the nomination and Senate process, and what moves the implied probabilities.',
    intro:
      'The Chair of the Federal Reserve is the most closely watched economic appointment in the United States. The Chair presides over the Board of Governors and, by long-standing custom, chairs the Federal Open Market Committee (FOMC), the body that sets short-term interest rates. Because the Chair shapes the path of borrowing costs, the dollar, and financial conditions, prediction markets on Polymarket and Kalshi run "who will be the next Fed Chair" contracts whenever a term is approaching its end. This page explains what the role is, how those markets price and resolve the question, and what news moves the implied odds. Prices here are crowd-implied probability estimates, not forecasts of certainty, and nothing on this page is financial advice.',
    sections: [
      {
        heading: 'What the Fed Chair does and how the term works',
        body: "The Federal Reserve Chair leads the Board of Governors and, by convention, presides over the FOMC, which directs U.S. monetary policy through the federal funds rate and the Fed's balance sheet. The Chair is the public face of the central bank, testifies to Congress twice a year on monetary policy, and steers the committee's consensus. Markets watch the seat closely because a change at the top can shift expectations for rate cuts, rate hikes, and the Fed's tolerance for inflation.\n\nThe Chair serves a four-year term and may be re-nominated for additional terms. Under the Banking Act of 1935, the Chair is chosen from among the sitting members of the Board of Governors, so a nominee either already holds a governor seat or must be confirmed to one. The four-year term as Chair runs separately from the much longer, staggered 14-year term a person can hold as a governor. That distinction matters: a Chair can step down or be replaced as Chair while still remaining on the Board as a governor.\n\nFor example, Jerome Powell's term as Chair ended in 2026; the Board named him chair pro tempore on May 15, 2026, and Kevin Warsh was sworn in as the new Chair on May 22, 2026, following a narrow Senate vote. A standard four-year term places the next scheduled Chair decision around 2030, though a term can also open early if a Chair resigns. Always check a live market for the current holder and the next decision point, since specifics change.",
      },
      {
        heading: 'How prediction markets frame the question',
        body: 'A "next Fed Chair" market lists the candidates seen as plausible nominees and assigns each a price between 0 and 1 (often shown as cents or a percentage). That price is the market\'s money-weighted estimate of the probability that the named person ends up in the seat under the contract\'s specific rule. A contract trading at 60 cents implies the crowd is putting roughly a 60% chance on that outcome.\n\nThese contracts come in several flavors, and the exact wording matters. Some ask who the President will nominate; others ask who will be formally confirmed by the Senate; others ask by what date a nomination or confirmation will happen. "Nominated" and "confirmed" are different events with different timelines, so two markets about the same person can show different prices. Read the title and rules before treating any number as the answer to your question.\n\nThe implied probabilities are useful as a fast read on consensus, but they are not guarantees. Markets can misprice low-information events, thin contracts can move on a single large trade, and a surprise nomination or a stalled confirmation can flip the odds quickly. Treat the price as a signal of what informed traders currently expect, not as settled fact.',
      },
      {
        heading: 'How these markets resolve',
        body: 'Resolution rules are the heart of any prediction market, and Fed Chair contracts are usually tied to a formal, verifiable step rather than press speculation. On Polymarket, the standard "who will be confirmed as Fed Chair" market resolves to the individual formally confirmed by the U.S. Senate as Chair of the Federal Reserve. The rules state that confirmation as a member of the Board of Governors alone does not qualify, and that recess appointments without Senate confirmation do not count. The primary resolution source is official information from the U.S. Senate, with a consensus of credible reporting as a backstop.\n\nMarkets that ask about the nomination rather than the confirmation resolve on a different trigger: the President formally sending a name to the Senate, or announcing the pick, depending on the wording. Date-based contracts ("confirmed by [date]") resolve based on whether the qualifying event happens before a stated deadline, and often resolve to "Other" or "No" if nothing qualifies in time.\n\nBecause the resolution source is an official record, these markets tend to settle cleanly once the Senate acts. The ambiguity, when it exists, lives in the gap between rumor and the formal step, which is exactly why "nominate" and "confirm" markets can diverge.',
      },
      {
        heading: 'What moves the odds',
        body: "The biggest driver is signaling from the administration. Public comments from the President about who he favors, reporting on a shortlist, interviews with candidates, and leaks from the search process all move the named contenders' prices. When an administration is openly hostile to the sitting Chair, markets price in a higher chance of an early change and a successor aligned with the President's policy preferences.\n\nThe incumbent's term timing is the structural clock. As a Chair's four-year term nears its end, attention and trading volume rise, and the field of plausible successors sharpens. Statements from the sitting Chair about whether they will seek another term, or stay on as a governor, reset the baseline. Any sign of an early exit, by resignation, health, or political pressure, can pull the timeline forward and reprice every candidate at once.\n\nThe Senate is the other gate. Even a clear nominee faces a confirmation vote, so the composition of the Senate, the Banking Committee's posture, and the head-count of likely yes and no votes feed directly into \"confirmed by [date]\" markets. A nominee can be the obvious pick yet still see confirmation odds wobble if the vote looks tight. Broader macro news, inflation prints, and the rate outlook matter more indirectly, by shaping which policy profile the administration is likely to want.",
      },
      {
        heading: 'Why this is a recurring question',
        body: 'The Fed Chair appointment is not a one-time event; it returns on a predictable four-year cycle, and sometimes sooner. Each cycle reopens the same set of questions: will the incumbent be re-nominated, who are the alternatives, when will the President announce, and can the nominee clear the Senate. That recurring structure is why prediction markets keep relaunching Fed Chair contracts, and why understanding the mechanism is more durable than memorizing any single outcome.\n\nFor a news reader, the value of these markets is as a live gauge of expectations around an appointment that directly affects interest rates, mortgages, savings, and the dollar. A shift in the odds is a prompt to read the underlying reporting, not a substitute for it. Crowdtells treats the market move as the signal that something changed, then briefs the actual news from multiple sources.\n\nAs always, prices are crowd-implied probabilities that can be wrong, contracts resolve only on their stated rule, and nothing here is financial or investment advice. For the current holder, the next decision point, and live odds, check an up-to-date market.',
      },
    ],
    faq: [
      {
        q: 'Who appoints the Federal Reserve Chair?',
        a: 'The President of the United States nominates the Fed Chair, and the U.S. Senate confirms the nomination, with the Senate Banking Committee vetting the nominee first. By law the Chair is chosen from among the sitting members of the Board of Governors, so a pick must already hold or be confirmed to a governor seat. The Chair serves a four-year term and can be re-nominated for additional terms.',
      },
      {
        q: "How long is the Fed Chair's term?",
        a: 'The term as Chair is four years and is renewable through re-nomination and Senate confirmation. This is separate from the longer 14-year term a person can serve as a member of the Board of Governors, which is why a former Chair can remain on the Board as a governor after their term leading it ends.',
      },
      {
        q: 'How do prediction markets decide who the next Fed Chair is?',
        a: 'Most contracts resolve to the individual formally confirmed by the U.S. Senate as Chair of the Federal Reserve, using official Senate records as the primary source. Being confirmed only as a Board governor does not qualify, and recess appointments without Senate confirmation typically do not count. Some related markets instead resolve on who is nominated, which is an earlier and separate step.',
      },
      {
        q: 'Who is the current Fed Chair?',
        a: "As of mid-2026, Kevin Warsh is the Chair, sworn in on May 22, 2026, after the Senate confirmed him, succeeding Jerome Powell. Powell's term as Chair had ended, and he was briefly named chair pro tempore before Warsh took office. Because the holder can change, check a current source for the latest.",
      },
      {
        q: 'What moves next Fed Chair odds the most?',
        a: "The strongest movers are signals from the administration, such as the President naming a favored candidate, reporting on a shortlist, or interviews with contenders. The incumbent's term timing acts as a clock, and any sign of an early exit reprices the field. For confirmation contracts, the Senate vote count and the Banking Committee's posture matter directly.",
      },
    ],
    relatedTopics: ['Economics', 'Finance', 'Politics'],
  },
  {
    slug: 'inflation-odds',
    title: 'Inflation Odds: CPI Prediction Markets and How They Resolve | Crowdtells',
    h1: 'Inflation Odds',
    metaDescription:
      'How prediction markets price inflation odds: what CPI and PCE measure, how CPI markets resolve on the BLS print, and what moves the numbers each month.',
    intro:
      'Inflation is the rate at which the general price level rises over time, eroding what a dollar buys. In the United States it is tracked mainly by two official series: the Consumer Price Index (CPI), published monthly by the Bureau of Labor Statistics, and the Personal Consumption Expenditures (PCE) price index, published monthly by the Bureau of Economic Analysis. Prediction markets such as Polymarket and Kalshi turn the next inflation reading into tradable contracts, where the price of a contract reads as a crowd-implied probability that, say, year-over-year CPI lands above a stated threshold. This page explains what inflation is and how it is measured, how those markets are framed and how they resolve against the official data, what tends to move the odds between releases, and the monthly calendar that drives the whole cycle. These prices are estimates that can be wrong, and nothing here is financial advice.',
    sections: [
      {
        heading: 'What inflation is and how it is measured',
        body: 'Inflation measures how fast prices are rising across the things households buy. The headline U.S. gauge is the Consumer Price Index for All Urban Consumers (CPI-U), compiled by the Bureau of Labor Statistics (BLS). It tracks a fixed basket of goods and services — food, shelter, fuels, transportation, medical care, clothing and more. To build it, BLS representatives collect prices each month in 75 urban areas, sampling rents and prices across a large set of housing units, retail outlets, and service establishments.\n\nTwo views of CPI are quoted constantly. The year-over-year (12-month) change is the familiar "inflation rate" headline; the month-over-month change shows the latest monthly pace. "Core" inflation strips out food and energy, two categories whose prices swing sharply, to show the steadier underlying trend.\n\nThe other major gauge is the PCE price index from the Bureau of Economic Analysis (BEA), released within its monthly Personal Income and Outlays report. PCE covers a broader set of spending and adjusts as consumers shift toward cheaper substitutes, so it usually runs a touch below CPI. The Federal Reserve targets 2 percent inflation over the longer run as measured by annual PCE — a goal it formally adopted in its January 2012 Statement on Longer-Run Goals and Monetary Policy Strategy — which is why core PCE draws outsized attention from markets and policymakers.',
      },
      {
        heading: 'How prediction markets frame inflation',
        body: 'Prediction markets convert an upcoming data release into yes/no contracts. A typical inflation market asks a precisely worded question about a single official print — for example, "Will year-over-year CPI for month M be above X%?" Other markets use ranges, listing several brackets (such as 2.5%–2.7%, 2.8%–3.0%, and so on) so that exactly one bracket resolves yes once the number lands. Some markets target the month-over-month change instead of the annual rate, and separate markets exist for core readings and for PCE.\n\nEach contract trades between 0 and 100 cents (or 0 and 1). That price is the market\'s money-weighted estimate of the probability the statement is true: a contract trading at 60 cents implies roughly a 60% chance, as judged by the people putting money on each side. As traders absorb new information, the price moves, and the implied probability moves with it.\n\nFor a news reader the useful signal is not any single quote but the shape of the distribution and how it shifts. A cluster of probability piling into the higher brackets says the crowd is leaning toward a hotter print; a shift toward lower brackets says the opposite. These are crowd estimates, not forecasts from the statistical agencies, and they can be — and sometimes are — wrong. Treat them as one input alongside the actual data, never as advice to trade.',
      },
      {
        heading: 'How inflation markets resolve',
        body: 'Inflation contracts resolve on the official government print, not on any estimate or revision chatter. For CPI markets the resolution source is the Bureau of Labor Statistics figure released on the scheduled day; for PCE markets it is the BEA figure in Personal Income and Outlays. The market\'s listed rules name the exact series, month and threshold in advance.\n\nThe precision of the print matters. Kalshi\'s year-over-year CPI markets, for instance, resolve against the one-decimal-place value BLS reports: if the stated 12-month change exceeds the contract\'s threshold, the "yes" side settles at $1 and "no" goes to zero; if not, the reverse. Because resolution keys off a published number to a fixed decimal, a reading that rounds right at the line decides the contract cleanly.\n\nMarkets generally resolve on the first official release rather than later revisions — government inflation data is revised, but the contract settles on the print named in its rules. Rulebooks also handle disruptions: if a federal government shutdown delays the source agency\'s data, expiration can be extended until the figure is published. The takeaway is that these are not opinion polls; they pay out on a specific, verifiable official number on a known date.',
      },
      {
        heading: 'What moves the odds between releases',
        body: 'Because each contract hangs on one upcoming print, the odds respond to anything that changes expectations for that number. Energy prices are the most visible mover: a jump in oil or gasoline feeds quickly into headline CPI and can push the implied probability of a higher reading up within days, while a drop does the reverse. Food prices work similarly. Both sit outside "core," so core-inflation markets react more to shelter, services and wage trends, which turn over more slowly.\n\nOther official releases act as previews. The Producer Price Index, import prices, wage data and surveys of business pricing all arrive before CPI or PCE and let traders update their estimate ahead of the headline. Shelter — the largest CPI component — moves gradually, so signs of cooling or firming rents can reset expectations for months at a time.\n\nFed policy and communication matter too, in both directions. Inflation prints shape what the Fed is expected to do with interest rates, and Fed signals about the path of policy shape expectations for future inflation. Around a release, the largest swings usually come right after the print itself, when the actual number replaces the guess and the market snaps to resolution. As always, a fast-moving price reflects shifting crowd opinion, which can overshoot or misread the data.',
      },
      {
        heading: 'The monthly release calendar',
        body: "Inflation runs on a monthly cycle, and the calendar is the spine of every market. CPI is released by the BLS once a month, at 8:30 a.m. Eastern Time, and each release covers the prior month — for example, June 2026 CPI was scheduled for release on July 14, 2026. BLS publishes the full year's CPI release dates in advance, so the resolution day for any month's market is known well ahead of time.\n\nThe PCE price index follows on its own schedule inside the BEA's Personal Income and Outlays report, also at 8:30 a.m. Eastern, typically near the end of the month following the reference month — a slightly longer lag than CPI. That sequencing means CPI usually lands first and PCE follows, with the two read together for a fuller picture.\n\nFor anyone tracking inflation odds, the rhythm is straightforward: probabilities build over the weeks before a release as new data arrives, tighten in the final days, and then resolve at 8:30 a.m. on print day. Specific dates and thresholds change every cycle, so check the official BLS and BEA schedules and a live market for the current figures rather than relying on any number quoted here as fixed.",
      },
    ],
    faq: [
      {
        q: 'What is the difference between CPI and PCE inflation?',
        a: 'CPI, from the Bureau of Labor Statistics, tracks a fixed basket of goods and services that urban consumers buy and is the most-quoted headline inflation rate. PCE, from the Bureau of Economic Analysis, covers a broader range of spending and adjusts as consumers substitute toward cheaper options, so it usually runs slightly below CPI. The Federal Reserve targets 2 percent inflation using annual PCE, which is why PCE gets close policy attention.',
      },
      {
        q: 'When is the CPI inflation report released each month?',
        a: 'The Bureau of Labor Statistics releases the Consumer Price Index once a month at 8:30 a.m. Eastern Time, and each report covers the previous month. The BLS publishes the full schedule of release dates in advance. As an example, June 2026 CPI was scheduled for release on July 14, 2026.',
      },
      {
        q: 'How do prediction markets on inflation resolve?',
        a: 'They resolve on the official government print named in the contract rules — the BLS figure for CPI markets or the BEA figure for PCE markets. For example, a year-over-year CPI market settles based on the 12-month change BLS reports to one decimal place: if it exceeds the threshold, "yes" pays out, otherwise "no" does. Settlement is on the official number on its scheduled release date, not on estimates or later revisions.',
      },
      {
        q: 'What does the price of an inflation contract mean?',
        a: "A contract trading between 0 and 100 cents reads as the market's crowd-implied probability that its statement is true — roughly 60% at 60 cents, for instance. It reflects how traders are weighing the odds with real money on each side, not an official forecast. These estimates can be wrong, and nothing about them is financial advice.",
      },
      {
        q: 'What moves inflation odds the most?',
        a: 'Energy and food prices move headline readings fastest, while core inflation responds more to shelter, services and wages, which change slowly. Earlier data releases such as the Producer Price Index and wage figures let traders update ahead of the main print. Fed policy expectations also matter, and the biggest swing typically comes at 8:30 a.m. on release day when the actual number lands.',
      },
    ],
    relatedTopics: ['Economics', 'Finance', 'Politics'],
  },
];
