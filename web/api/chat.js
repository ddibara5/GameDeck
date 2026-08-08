// Vercel serverless function - GameDeck "Discover" AI.
// Grounds Claude in the user's real Supabase library and returns a reply.
// The Anthropic key lives ONLY here (server-side) and is never sent to the client.
//
// Required env vars (set in Vercel project settings):
//   ANTHROPIC_API_KEY   - your Anthropic API key (server-side only)
//   SUPABASE_URL        - https://YOUR-PROJECT.supabase.co
//   SUPABASE_ANON_KEY   - the public anon key (read-only; RLS allows SELECT)
// Optional:
//   CLAUDE_MODEL        - defaults to claude-haiku-4-5
//   GAMEDECK_APP_SECRET - if set, callers must send header `x-gamedeck-key` matching it

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You are GameDeck, a sharp gaming concierge and recommender for one person, Dave.
Your default job is to recommend NEW games Dave does NOT already own, worth playing next. His library (below) is CONTEXT, not the menu: use it two ways - (1) as his taste profile, and (2) as a do-not-recommend list, so you never suggest a game he already owns unless he explicitly asks for one. Use web search to find current, real information (new and upcoming releases, what is on Game Pass now, review reception, how long a game is, rough price).

His taste (weight recommendations toward this):
- Loves: RPGs (Final Fantasy, Persona, Elden Ring-likes), action/adventure (GTA, RDR, Spider-Man). Follows FromSoftware and Rockstar closely.
- Platforms: multi-platform - Xbox Series X/S (primary), PS5, Switch/Switch 2, Gaming PC, ROG Ally X. Prefers Xbox + Game Pass first when it applies.
- Not interested in: VR, sports, esports, MMO grind/raid content, battle royales. Never recommend these.

His library below has two kinds: games he has PLAYED, and a large BACKLOG he owns but has NEVER played (tagged UNPLAYED). Treat BOTH as already-owned: do not recommend them by default.

How to recommend:
- Default to games he does NOT own. Lead with ONE clear pick, then 1-2 alternates. Never dump a long list.
- Every pick must be "new to you" (not in his library). Say where to get it - Game Pass, platform, rough price if useful. Prefer things playable now (currently on Game Pass, or out on a platform he has) unless he asks otherwise.
- Ground each pick in his taste and, where it helps, connect it to games he owns ("since you liked X..."), but the recommendation itself must be something he does not already have.
- Use web search for release dates, prices, Game Pass status, and reviews; prefer recent real facts over memory. Do not invent them - search, or say you are unsure.
- ESCAPE HATCH: only if he explicitly asks for something from his backlog or library (e.g. "from my backlog", "something I own", "a game I already have") should you recommend owned titles. Then pick from his UNPLAYED backlog or in-progress games and note his completion % / playtime and whether it is a fresh start or continuing progress.
- Be brief and direct. Bullets over paragraphs. No em dashes or en dashes; use commas or hyphens.
- If the library can answer a data question (how many games, most played, near completion, backlog size), answer from the data.`;

async function loadCatalog() {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) throw new!\œ›ÜŠ	Ôİ\X˜\ÙH[ˆ˜\œÈ\™H›İÛÛ™šYİ\™Y‰ÊNÂ‚ˆÛÛœİÛÛÈH	İ]K[š\›Û›Y[\˜Ù[^][YWÛZ[]\ËX\›™YØ]Ø\™Ëİ[Ø]Ø\™Ë\İÜ^YYİ]\ÉÎÂˆÛÛœİ\›H	Ø˜\Ù_KÜ™\İİŒKÙØ[Y\ÏÜÙ[XİIØÛÛßI›Ü™\[\İÜ^YY™\ØË›[Û\İ	›[Z]MLÂˆÛÛœİ™\ÈH]ØZ]™]Ú
\›ÈXY\œÎˆÈ\ZÙ^NˆÙ^K]]Üš^˜][Ûˆ™X\™\ˆ	ÚÙ^_XHJNÂˆYˆ
\™\Ë›ÚÊH›İÈ™]È\œ›ÜŠİ\X˜\ÙH™XY˜Z[Yˆ	Ü™\Ëœİ]\ßX
NÂˆÛÛœİ›İÜÈH]ØZ]™\ËšœÛÛŠ
NÂ‚ˆÛÛœİ]HÈ›Şˆ	Ö›Ş	ËÛˆ	ÔÉËİX[Nˆ	ÔİX[IÈNÂˆ]˜XÚÛÙĞÛİ[HÂˆÛÛœİ[™\ÈH›İÜË›X\

ÊHOˆÂˆÛÛœİHX]œ›İ[™

Ëœ^][YWÛZ[]\È
HÈŠHÈLÈËÈİ\œËHˆÛÛœİ\ˆHË›\İÜ^YYÈİš[™ÊË›\İÜ^YY
KœÛXÙJÊHˆ	Û™]™\‰ÎÂˆÛÛœİİHX]œ›İ[™
Ëœ\˜Ù[
NÂˆÛÛœİ[œ^YYHYË›\İÜ^YY	‰ˆ
Ëœ^][YWÛZ[]\È
HOOHÂˆYˆ
[œ^YY
H˜XÚÛÙĞÛİ[
ÊÎÂˆÛÛœİYÈH[œ^YYÈ	ÈS”VQQ	Èˆ	ÉÎÂˆ™]\›ˆ	ÙË]_H	Ü]ÙË™[š\›Û›Y[HË™[š\›Û›Y[H	ÜİIH	ÚZXÚ	ÙË™X\›™YØ]Ø\™ÈKÉÙËİ[Ø]Ø\™ÈH\İ	Ş\ŸIİYßXÂˆJNÂ‚ˆÛÛœİXY\ˆH]™IÜÈXœ˜\Nˆ	Ü›İÜË›[™İHØ[Y\ËÙˆÚXÚ	Ø˜XÚÛÙĞÛİ[H\™HİÛ™Y]‘U‘Tˆ^YY
\È˜XÚÛÙËYÙÙYS”VQQ
Kˆ›Ü›X]ˆ]H]›Ü›HÛÛ\][Û‰Hİ\œÈXÚY]™[Y[È\İ^YY
VVVKSSJHS”VQQ
Û›HYˆ™]™\ˆ^YY
XÂˆ™]\›ˆ	ÚXY\ŸW‰Û[™\Ëš›Ú[Š	×‰Ê_XÂŸB‚™^ÜY˜][\Ş[˜È[˜İ[Ûˆ[™\Š™\K™\ÊHÂˆYˆ
™\K›Y]ÙOOH	ÔÔÕ	ÊHÂˆ™\Ëœİ]\ÊJKšœÛÛŠÈ\œ›Üˆ	ÓY]Ù›İ[İÙY	ÈJNÂˆ™]\›ÂˆB‚ˆËÈÜ[Û˜[Ú\™Y\ÙXÜ™]İX\™›Üˆ\È
ZY
H[™Ú[ˆYˆĞSQQPÒ×ĞTÔÑPÔ‘U\ÂˆËÈÙ][ˆH™\˜Ù[›Ú™Xİ]™\H™\]Y\İ]\İÙ[™HX]Ú[™ÈYØ[YYXÚËZÙ^HXY\‹‚ˆËÈYˆ[œÙ]H[™Ú[İ^\ÈÜ[‹ÛÈ\ŞZ[™È\È™]™\ˆœ™XZÜÈH\[[[İHÜ[‹‚ˆÛÛœİTÔÑPÔ‘UH›ØÙ\ÜË™[‹‘ĞSQQPÒ×ĞTÔÑPÔ‘UÂˆYˆ
TÔÑPÔ‘U	‰ˆ™\KšXY\œÖÉŞYØ[YYXÚËZÙ^I×HOOHTÔÑPÔ‘U
HÂˆ™\Ëœİ]\ÊJKšœÛÛŠÈ\œ›Üˆ	Õ[˜]]Üš^™Y	ÈJNÂˆ™]\›ÂˆBˆYˆ
\›ØÙ\ÜË™[‹S•“ÔP×ĞTWÒÑVJHÂˆ™\Ëœİ]\ÊL
KšœÛÛŠÈ\œ›Üˆ	ÔÙ\™\ˆZ\ÜÚ[™ÈS•“ÔP×ĞTWÒÑVIÈJNÂˆ™]\›ÂˆB‚ˆHÂˆÛÛœİ›ÙHH\[Ùˆ™\K˜›ÙHOOH	Üİš[™ÉÈÈ”ÓÓ‹œ\œÙJ™\K˜›ÙH	ŞßIÊHˆ
™\K˜›ÙHßJNÂˆÛÛœİY\ÜØYÙ\ÈH\œ˜^Kš\Ğ\œ˜^J›ÙK›Y\ÜØYÙ\ÊHÈ›ÙK›Y\ÜØYÙ\Èˆ×NÂˆÛÛœİÛX[ˆHY\ÜØYÙ\Âˆ™š[\Š
JHOˆH	‰ˆ
Kœ›ÛHOOH	İ\Ù\‰ÈKœ›ÛHOOH	Ø\ÜÚ\İ[	ÊH	‰ˆ\[ÙˆK˜ÛÛ[OOH	Üİš[™ÉÊBˆœÛXÙJLMŠHËÈÙY\H\İMˆ\›œÂˆ›X\

JHOˆ
È›ÛNˆKœ›ÛKÛÛ[ˆK˜ÛÛ[JJNÂ‚ˆYˆ
ÛX[‹›[™İOOHÛX[–ØÛX[‹›[™İHWKœ›ÛHOOH	İ\Ù\‰ÊHÂˆ™\Ëœİ]\Ê
KšœÛÛŠÈ\œ›Üˆ	ÛY\ÜØYÙ\È]\İ[™Ú]H\Ù\ˆ\›‰ÈJNÂˆ™]\›ÂˆB‚ˆÛÛœİØ][ÙÈH]ØZ]ØYØ][ÙÊ
NÂ‚ˆÛÛœİ™\]Y\İ›ÙHHÂˆ[Ù[ˆSÑSˆX^İÚÙ[œÎˆLˆŞ\İ[NˆÂˆÈ\Nˆ	İ^	Ë^ˆÖTÕSWÔ“ÓTKˆËÈØXÚHH
\™ÙKİX›JHØ][ÙÈÛÈ™\X]\›œÈ[ˆHÙ\ÜÚ[Ûˆ\™HŒLÚX\\‹‚ˆÈ\Nˆ	İ^	Ë^ˆØ][ÙËØXÚWØÛÛ›ÛˆÈ\Nˆ	Ù\[Y\˜[	ÈHKˆKˆËÈ]™HÙXˆÙX\˜ÚÛÈ™XÛÛ[Y[™][ÛœÈØ[ˆ[˜ÛYH™]ÈÈ›İ^Y][İÛ™YØ[Y\ËˆËÈØ[YH\ÜÈİ]\ËšXÙ\Ë[™™]šY]ÜËˆX^İ\Ù\ÈØ\ÈÛÜİ\ˆ™\]Y\İ‚ˆÛÛÎˆŞÈ\Nˆ	İÙX—ÜÙX\˜ÚÌŒLÌIË˜[YNˆ	İÙX—ÜÙX\˜Ú	ËX^İ\Ù\ÎˆWKˆY\ÜØYÙ\ÎˆÛX[‹ˆNÂ‚ˆËÈHTH[œÈHÙX\˜ÚÙ\™\‹\ÚYK]HÛ™ÈÙX\˜Ú\›ˆØ[ˆÛÛYH˜XÚÂˆËÈÚ]İÜÜ™X\ÛÛˆœ]\ÙWİ\›ˆÈ™K\Ù[™H\ÜÚ\İ[ÛÛ[[˜Ú[™ÙYÈÛÛ[YK‚ˆ]ÛÛ›ÈHÛX[ÂˆÛÛœİ^\ÈH×NÂˆÛÛœİÚ]][ÛœÈH×NÂˆ›Üˆ
]HHÈHÈJÊÊHÂˆ™\]Y\İ›ÙK›Y\ÜØYÙ\ÈHÛÛ›ÎÂˆÛÛœİT™\ÈH]ØZ]™]Ú
	ÚÎ‹ËØ\K˜[›ÜXË˜ÛÛKİŒKÛY\ÜØYÙ\ÉËÂˆY]Ùˆ	ÔÔÕ	ËˆXY\œÎˆÂˆ	ŞX\KZÙ^IÎˆ›ØÙ\ÜË™[‹S•“ÔP×ĞTWÒÑVKˆ	Ø[›ÜXË]™\œÚ[Û‰Îˆ	ÌŒŒËL‹LIËˆ	ØÛÛ[]\IÎˆ	Ø\XØ][Û‹ÚœÛÛ‰ËˆKˆ›ÙNˆ”ÓÓ‹œİš[™ÚYJ™\]Y\İ›ÙJKˆJNÂ‚ˆYˆ
XT™\Ë›ÚÊHÂˆÛÛœİ]Z[H]ØZ]T™\Ë^

NÂˆ™\Ëœİ]\ÊLŠKšœÛÛŠÈ\œ›Üˆ	ĞRH™\]Y\İ˜Z[Y	Ë]Z[ˆ]Z[œÛXÙJL
HJNÂˆ™]\›ÂˆB‚ˆÛÛœİ]HH]ØZ]T™\ËšœÛÛŠ
NÂˆ›Üˆ
ÛÛœİˆÙˆ]K˜ÛÛ[×JHÂˆYˆ
‹\HOOH	İ^	È	‰ˆ‹^
HÂˆ^\Ëœ\Ú
‹^
NÂˆ›Üˆ
ÛÛœİÈÙˆ‹˜Ú]][ÛœÈ×JHÂˆYˆ
È	‰ˆË\›
HÚ]][ÛœËœ\Ú
È\›ˆË\›]NˆË]HË\›JNÂˆBˆBˆB‚ˆYˆ
]KœİÜÜ™X\ÛÛˆOOH	Ü]\ÙWİ\›‰ÊHÂˆÛÛ›ÈHË‹‹˜ÛÛ›ËÈ›ÛNˆ	Ø\ÜÚ\İ[	ËÛÛ[ˆ]K˜ÛÛ[WNÂˆÛÛ[YNÂˆBˆœ™XZÎÂˆB‚ˆ]™\HH^\Ëš›Ú[Š	ÉÊKš[J
NÂ‚ˆËÈYˆH[Ù[ÙX\˜ÚY\[™\È[š\]YHÛİ\˜Ù\È
Ú]][ÛœÈ\™H™\]Z\™YˆËÈÚ[ˆÚİÚ[™ÈÙXˆ™\İ[ÈÈ\Ù\œË[™]XZÙ\ÈHœ™\ÙX\˜Úˆš\ÚX›JK‚ˆÛÛœİÙY[ˆH™]ÈÙ]

NÂˆÛÛœİÛİ\˜Ù\ÈH×NÂˆ›Üˆ
ÛÛœİÈÙˆÚ]][ÛœÊHÂˆYˆ
ÙY[‹š\ÊË\›
JHÛÛ[YNÂˆÙY[‹˜Y
Ë\›
NÂˆÛİ\˜Ù\Ëœ\Ú
HÉØË]_WJ	ØË\›JX
NÂˆYˆ
Ûİ\˜Ù\Ë›[™İH
Hœ™XZÎÂˆBˆYˆ
Ûİ\˜Ù\Ë›[™İ
H™\H
ÏH—”Ûİ\˜Ù\Î—‰ÜÛİ\˜Ù\Ëš›Ú[Š	×‰Ê_XÂ‚ˆ™\Ëœİ]\ÊŒ
KšœÛÛŠÈ™\Nˆ™\H	Ó›È™\K‰ÈJNÂˆHØ]Ú
\œŠHÂˆ™\Ëœİ]\ÊL
KšœÛÛŠÈ\œ›Üˆ	ÔÙ\™\ˆ\œ›Ü‰Ë]Z[ˆİš[™Ê\œˆ	‰ŠW'"æÖW76vRÇÂW'"’Ò“°¢Ğ§Ğ