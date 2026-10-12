const {test} = require('node:test');
const assert = require('node:assert/strict');
const {eligibility,downloadDirectory,complete,within} = require('../manifests/download-cache-cleanup/cleanup.cjs');
const hash='a'.repeat(40), now=Date.parse('2026-10-20T12:00:00Z');
const directory='/downloads/bookorbit/Test book';
const torrent={hash,category:'bookorbit',state:'pausedUP',progress:1,amount_left:0,
 name:'Test book',save_path:'/downloads/bookorbit',content_path:directory};
const imported={client_key:hash,download_id:2,request_id:1,download_status:'imported',request_status:'available',
 matched_book_id:10,book_status:'present',imported_at:'2026-10-12T12:00:00Z',content_path:directory,
 local_path:directory+'/book.m4b',library_files:[{path:'/books/audiobooks/Author/book.m4b',size:123}]};
const eligible=(rows=[imported],t=torrent)=>eligibility(rows,t,now,7);
test('allows only an aged, completed, confirmed import',()=>assert.equal(eligible(),null));
test('file-named audio torrents match Decypharr folder naming without broad suffix stripping',()=>{
 assert.equal(complete({...torrent,name:'Test book.mp3'},hash),true);
 assert.equal(complete({...torrent,name:'Test book.M4B'},hash),true);
 assert.equal(complete({...torrent,name:'Test book.epub'},hash),false);
 assert.equal(complete({...torrent,name:'Test book.2026'},hash),false);
});
test('seven days begins at successful import',()=>{
 assert.equal(eligible([{...imported,imported_at:'2026-10-19T00:00:00Z'}]),'retention');
 assert.equal(eligible([{...imported,imported_at:null}]),'retention');
});
test('a second recent import of the same hash protects shared download',()=>
 assert.equal(eligible([imported,{...imported,request_id:2,imported_at:'2026-10-19T00:00:00Z'}]),'retention'));
test('failed attempts are ignored only after a newer successful import of that request',()=>{
 assert.equal(eligible([{...imported,download_id:1,download_status:'failed'},imported]),null);
 assert.equal(eligible([imported,{...imported,download_id:3,download_status:'failed'}]),'unconfirmed_attempt');
 assert.equal(eligible([imported,{...imported,request_id:2,download_status:'downloading'}]),'unconfirmed_attempt');
});
test('pending review, missing book linkage, and removed library books are protected',()=>{
 for(const change of [{request_status:'needs_review'},{matched_book_id:null},{book_status:'missing'},{library_files:[]}])
  assert.equal(eligible([{...imported,...change}]),'unlinked_library');
});
test('active, checking, incomplete or other-category torrents are protected',()=>{
 for(const change of [{state:'downloading'},{state:'checkingUP'},{progress:0.99},{amount_left:1},{category:'other'},
 {save_path:'/books/audiobooks'},{name:'../Test book'},{name:'Different book'}])
  assert.equal(complete({...torrent,...change},hash),false);
});
test('deletion scope excludes root, traversal, nested paths, and library folders',()=>{
 for(const p of ['/downloads/bookorbit','/downloads/bookorbit/../books','/downloads/bookorbit/a/b',
 '/downloads/bookorbit-else/book','/books/audiobooks/book','/downloads/bookorbit/a/','/downloads/bookorbit/a\\b'])
  assert.equal(downloadDirectory(p),false,p);
 assert.equal(downloadDirectory(directory),true);
});
test('queue and import paths must agree',()=>{
 assert.equal(eligible([{...imported,content_path:directory+' other'}]),'path_mismatch');
 assert.equal(eligible([{...imported,local_path:directory+' other/book.m4b'}]),'path_mismatch');
});
test('library copies must be nonempty and inside a read-only library root',()=>{
 for(const file of [{path:'/downloads/bookorbit/Test book/book.m4b',size:123},
 {path:'/books/audiobooks/../book.m4b',size:123},{path:'/books/audiobooks/book.m4b',size:0}])
  assert.equal(eligible([{...imported,library_files:[file]}]),'unsafe_library_path');
 assert.equal(within('/books/audiobooks2/book','/books/audiobooks'),false);
});
