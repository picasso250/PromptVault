(() => {
  const input = document.getElementById("image-input");
  const preview = document.getElementById("image-preview");
  if (!input || !preview) return;

  const image = preview.querySelector("img");
  const label = preview.querySelector("span");
  let previewUrl = "";

  function showPreview(file) {
    if (!file || !file.type.startsWith("image/")) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    image.src = previewUrl;
    label.textContent = file.name || "已粘贴的图片";
    preview.hidden = false;
  }

  async function normalizeImage(file) {
    if (!file || !file.type.startsWith("image/")) return file;
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("图片转换失败"))),
        "image/jpeg",
        0.85
      );
    });
    return new File([blob], "prompt-image.jpg", {
      type: "image/jpeg",
      lastModified: Date.now()
    });
  }

  function setInputFile(file) {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    showPreview(input.files[0]);
  }

  async function normalizeAndSet(file) {
    try {
      setInputFile(await normalizeImage(file));
    } catch {
      showPreview(file);
    }
  }

  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (file) normalizeAndSet(file);
  });

  document.addEventListener("paste", (event) => {
    const files = Array.from(event.clipboardData ? event.clipboardData.files : []);
    const file = files.find((item) => item.type.startsWith("image/"));
    if (!file) return;

    normalizeAndSet(file);
    event.preventDefault();
  });
})();
