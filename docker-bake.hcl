variable "DATABASE_URL" { default = "" }
variable "NEXT_PUBLIC_WEB_URL" { default = "" }
variable "NEXT_PUBLIC_DOCS_URL" { default = "" }
variable "TAG" { default = "latest" }

group "default" {
  targets = ["web", "docs"]
}

target "web" {
  context = "."
  dockerfile = "Dockerfile"
  target = "runner-web"
  tags = [
    "ghcr.io/xiepixie/sparkle-web:latest",
    "ghcr.io/xiepixie/sparkle-web:${TAG}"
  ]
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
  tags = [
    "ghcr.io/xiepixie/sparkle-docs:latest",
    "ghcr.io/xiepixie/sparkle-docs:${TAG}"
  ]
  args = {
    NEXT_PUBLIC_WEB_URL = "${NEXT_PUBLIC_WEB_URL}"
    NEXT_PUBLIC_DOCS_URL = "${NEXT_PUBLIC_DOCS_URL}"
  }
}
