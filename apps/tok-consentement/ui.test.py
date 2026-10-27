"""Local browser regression tests. All API/auth responses are mocked; no real consent or mail."""
import json, math, pathlib, subprocess
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).parent
CONTRACT=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {configuredContract} from './.build/api.js';console.log(JSON.stringify(await configuredContract({controller:'Exploitant de test',address:'Rue de test 1, 1200 Genève',email:'test@example.com'})));"],cwd=ROOT,text=True))
BASE='https://tok-consentement-restaurateurs.vercel.app'
URL='https://wwcrtyoueexyxkkikaos.supabase.co'
config={'configured':True,'contract':CONTRACT,'supabaseUrl':URL,'publicKey':'test-key','mailConfigured':True}
posted=[]
def mock(route):
 r=route.request
 if r.url.startswith(BASE):
  path=r.url.split('?')[0].removeprefix(BASE).split('#')[0];name='index.html' if path in ('','/') else path.lstrip('/')
  file=ROOT/'public'/name
  if file.name not in ('index.html','app.js','style.css'):route.fulfill(status=404,body='');return
  route.fulfill(status=200,content_type={'html':'text/html','js':'text/javascript','css':'text/css'}[file.suffix[1:]],body=file.read_text());return
 if '/auth/v1/' in r.url:
  if '/user' in r.url: data={'id':'test-user','factors':[{'id':'test-factor','factor_type':'totp','status':'verified'}]}
  elif '/challenge' in r.url: data={'id':'test-challenge'}
  else: data={'access_token':'test-session'}
 elif r.method=='GET': data=config
 else:
  p=r.post_data_json;posted.append(p);action=p['action']
  if action=='submit': data={'id':'00000000-0000-4000-8000-000000000000','createdAt':'2026-10-27T12:00:00Z','documentHash':'a'*64,'emailSent':True,'status':'pending'}
  elif action=='list': data={'items':[],'hasMore':False,'nextOffset':50}
  elif action=='configure': config['configured']=True;data={'configured':True,'contract':CONTRACT}
  elif action in ('receipt','confirm','withdraw'):
   data={'id':'00000000-0000-4000-8000-000000000000','document':{**CONTRACT,'restaurant':'Restaurant test','name':'Personne test','role':'Gérant','email':'test@example.com','signature':[[[.1+i*.02,.5+math.sin(i)*.1] for i in range(30)]]},'documentHash':'b'*64,'createdAt':'2026-10-27T12:00:00Z','confirmedAt':None,'withdrawnAt':None,'expiresAt':'2028-10-27T12:00:00Z','status':{'receipt':'pending','confirm':'confirmed','withdraw':'withdrawn'}[action]}
  else: data={'error':'unexpected'}
 route.fulfill(status=200,content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*'})
def initialize(page):
 page.set_default_timeout(5000)
 page.route(URL+'/**',mock)
 html=(ROOT/'public/index.html').read_text().replace('<link rel="stylesheet" href="/style.css">','').replace('<script src="/app.js" defer></script>','')
 page.set_content(html)
 page.add_style_tag(content=(ROOT/'public/style.css').read_text())
 page.add_script_tag(content=(ROOT/'public/app.js').read_text())
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  errors=[]
  for width in (320,390,1280):
   page=browser.new_page(viewport={'width':width,'height':900});page.on('pageerror',lambda e:errors.append(str(e)));initialize(page);page.get_by_role('heading',name='Votre établissement').wait_for()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'overflow {width}'
   assert not page.locator('[name=consent]').is_checked()
   page.screenshot(path=f'/mnt/data/consent-mobile-{width}.png',full_page=True)
   for name,value in {'restaurant':'Restaurant test','name':'Personne test','role':'Gérant','email':'test@example.com','emailAgain':'test@example.com'}.items():page.locator(f'[name={name}]').fill(value)
   page.locator('[name=consent]').check();page.get_by_role('button',name='Signer et recevoir mon e-mail de confirmation').click();page.get_by_role('alert').filter(has_text='signature complète').wait_for()
   canvas=page.locator('#signature');canvas.scroll_into_view_if_needed();box=canvas.bounding_box();page.mouse.move(box['x']+box['width']*.12,box['y']+100);page.mouse.down()
   for i in range(30):page.mouse.move(box['x']+box['width']*(.12+i*.022),box['y']+100+math.sin(i)*23)
   page.mouse.up();page.get_by_role('button',name='Signer et recevoir mon e-mail de confirmation').click();page.get_by_role('heading',name='Un dernier clic dans votre boîte mail.').wait_for()
   assert posted[-1]['consent'] is True and len(posted[-1]['signature'][0])>=10
   assert 'localStorage.setItem' not in (ROOT/'public/app.js').read_text()
   page.close()
  page=browser.new_page(viewport={'width':390,'height':844});initialize(page);page.get_by_role('heading',name='Votre établissement').wait_for();posted.clear();page.evaluate("location.hash='#receipt='+ 'c'.repeat(64)");page.get_by_role('button',name='Confirmer mon autorisation').wait_for();assert [x['action'] for x in posted]==['receipt'];page.get_by_role('button',name='Confirmer mon autorisation').click();page.get_by_text('Confirmée',exact=True).wait_for();page.on('dialog',lambda d:d.accept());page.get_by_role('button',name='Retirer mon autorisation').click();page.get_by_text('Retirée',exact=True).wait_for();assert page.get_by_role('button',name='Confirmer mon autorisation').count()==0
  page.evaluate("location.hash='#admin'");page.get_by_role('heading',name='Connexion administrateur').wait_for();page.locator('[name=email]').fill('admin@example.com');page.locator('[name=password]').fill('test-password-only');page.get_by_role('button',name='Continuer').click();page.locator('[name=code]').fill('123456');page.get_by_role('button',name='Ouvrir le registre privé').click();page.get_by_role('heading',name='Des accords traçables.').wait_for();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.get_by_role('button',name='Se déconnecter').click();page.get_by_role('heading',name='Connexion administrateur').wait_for()
  config['contract']=None;config['configured']=False;page.evaluate("location.hash=''");page.get_by_role('heading',name='Une dernière étape avant l’ouverture.').wait_for();assert page.locator('#consent-form').count()==0
  assert not errors,errors
  browser.close();print('PASS: 3 responsive signature flows, receipt explicit confirm/withdraw, admin MFA/logout, setup gating, zero browser errors or local storage.')
finally: pass
