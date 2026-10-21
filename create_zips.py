import os
import zipfile
import shutil

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(ROOT_DIR, 'dist')
PUBLIC_DIR = os.path.join(ROOT_DIR, 'public')

# Ensure dist exists
if not os.path.exists(DIST_DIR):
    raise SystemExit("Dist folder does not exist. Run npm run build first.")

# 1. Zip the dist folder (Production package ready to deploy, strictly web assets only)
dist_zip_path = os.path.join(PUBLIC_DIR, 'pos-canli-web-dist.zip')
with zipfile.ZipFile(dist_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(DIST_DIR):
        for file in files:
            if file.endswith('.zip'):
                continue
            file_path = os.path.join(root, file)
            arcname = os.path.relpath(file_path, DIST_DIR)
            zipf.write(file_path, arcname)
print(f"Created: {dist_zip_path} ({os.path.getsize(dist_zip_path)} bytes)")

# 2. Zip the entire source code (excluding node_modules, dist, .git, zip files)
source_zip_path = os.path.join(PUBLIC_DIR, 'pos-proje-kaynak-kodlari.zip')
exclude_dirs = {'node_modules', '.git', 'dist', '.cache'}
exclude_extensions = {'.zip', '.log'}

with zipfile.ZipFile(source_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(ROOT_DIR):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for file in files:
            ext = os.path.splitext(file)[1]
            if ext in exclude_extensions:
                continue
            file_path = os.path.join(root, file)
            if file_path == source_zip_path or file_path == dist_zip_path:
                continue
            arcname = os.path.relpath(file_path, ROOT_DIR)
            zipf.write(file_path, arcname)
print(f"Created: {source_zip_path} ({os.path.getsize(source_zip_path)} bytes)")

# Copy the fresh zips to dist as well so dev & prod server can serve them directly
shutil.copyfile(dist_zip_path, os.path.join(DIST_DIR, 'pos-canli-web-dist.zip'))
shutil.copyfile(source_zip_path, os.path.join(DIST_DIR, 'pos-proje-kaynak-kodlari.zip'))
print("Copied zip archives to dist folder for instant serving.")
