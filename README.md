# ระบบบริหารจัดการกำลังพล — V7


ใช้ V7 เป็นหลัก ข้อมูลจริงยังอยู่ใน Google Sheets และเข้าระบบด้วยชื่อ + PIN เดิม


## สถานะการติดตั้ง


เปิด GitHub Pages แล้ว: https://nattamet22.github.io/Work-Space/

ยังไม่ได้ติดตั้งตัวโหลดใน Apps Script จึงยังไม่อัปเดต App.html จาก GitHub อัตโนมัติ ขณะนี้หน้า Pages ฝังเว็บแอปเดิม ต้องเชื่อม Apps Script ตามขั้นตอนด้านล่างอีกครั้ง


## ไฟล์


- `App.html`: หน้าระบบ V7 สำหรับให้ Apps Script โหลด ไม่ใช่หน้าเว็บแบบ static; ตัดโหมดและข้อมูลตัวอย่างออกแล้ว
- `index.html`: หน้า GitHub Pages ที่ฝังเว็บแอปเดิม พร้อมปุ่มเปิดเต็มหน้าจอสำหรับพิมพ์หรือกรณีเบราว์เซอร์ไม่ยอมฝังเว็บ
- `Code.gs`: Backend V7 พร้อมตัวโหลด GitHub ตัดฟังก์ชันใส่ข้อมูลตัวอย่างออกแล้ว
- `GitHub-loader.gs.txt`: เฉพาะ doGet สำหรับแทนที่ doGet เดิม เมื่อ backend ปัจจุบันเป็น V7 อยู่แล้ว


## ตั้งค่าครั้งเดียว


1. Repository Settings → Pages → Deploy from a branch → `main` → `/ (root)` → Save
2. สำรองโค้ด Apps Script เดิม ตรวจว่า backend เป็น V7 ก่อนเปลี่ยน หากเป็น V7 ให้แทนเฉพาะ `doGet` ด้วยตัวโหลดที่เตรียมไว้
3. เก็บไฟล์ HTML ชื่อ `Index` ใน Apps Script ไว้เป็นหน้าสำรอง (ใช้เนื้อหาจาก `App.html`)
4. อนุญาตสิทธิ์ UrlFetchApp เมื่อ Google ขอ แล้ว Deploy → Manage deployments → Edit deployment เดิม → New version → Deploy เพื่อรักษาลิงก์เดิม ไม่ต้องสร้าง deployment ใหม่
5. ตรวจหน้าเข้าสู่ระบบและ build `7.0-github` หลังติดตั้ง ทดสอบด้วยบัญชีของระบบ


ไม่ต้องสร้างชีทใหม่ ไม่ต้องรัน setupSpreadsheet หรือ clearAllData สำหรับการเชื่อมเว็บที่มีข้อมูลอยู่แล้ว


## การอัปเดตหลังติดตั้ง


แก้ `App.html` บน branch `main` แล้ว commit จากนั้นรีเฟรชเว็บ ระบบดึงหน้าเว็บล่าสุดจาก GitHub โดยไม่ต้องคัดลอก HTML ลง Apps Script ทุกครั้ง อาจมีความหน่วงจากแคชของ GitHub หลายนาที ถ้าดึงไม่ได้จะใช้ Index สำรอง


การแก้ `Code.gs` ยังต้องนำไปอัปเดตและ deploy Apps Script; repository นี้ยังไม่ได้ตั้งการ deploy backend อัตโนมัติ การมีหน้า GitHub Pages อย่างเดียวไม่ทำให้ backend อัปเดต


Repository เป็น public จึงไม่ควรใส่ข้อมูลจากชีท, PIN, token หรือข้อมูลส่วนบุคคลลงในโค้ด การเข้าสู่ระบบและข้อมูลยังทำงานที่ Apps Script

