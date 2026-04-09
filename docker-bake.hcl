variable "DATABASE_URL" { default = "" }
variable "NEXT_PUBLIC_WEB_URL" { default = "" }
variable "NEXT_PUBLIC_DOCS_URL" { default = "" }

group "default" {
  targets = ["web", "docs"]
}

target "web" {
  context = "."
  dockerfile = "Dockerfile"
  target = "runner-web"
  tags = ["ghcr.io/xiepixie/sparkle-web:latest"]
  args = {
    DATABASE_URL = "${DATABASE_URL}"
    NEXT_PUBLIC_WEB_URL = "${NEXT_PUBLIC_WEB_URL}"
    NEXT_PUBLIC_DOCS_URL = "${NEXT_PUBLIC_DOCS_URL}"
  }
}

target "docs" {
  context = "."
  dockerfile = "Dockerfile"
  target = "runner-docs"
  tags = ["ghcr.io/xiepixie/sparkle-docs:latest"]
  args = {
    NEXT_PUBLIC_WEB_URL = "${NEXT_PUBLIC_WEB_URL}"
    NEXT_PUBLIC_DOCS_URL = "${NEXT_PUBLIC_DOCS_URL}"
  }
}
