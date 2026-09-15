import os
import requests

def fetch_contribution_data(username, token):
    """Queries GitHub's GraphQL API for the user's contribution grid."""
    headers = {"Authorization": f"Bearer {token}"}
    query = """
    query($userName:String!) {
      user(login: $userName){
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                contributionLevel
                date
              }
            }
          }
        }
      }
    }
    """
    
    response = requests.post(
        "https://api.github.com/graphql", 
        json={"query": query, "variables": {"userName": username}}, 
        headers=headers
    )
    
    if response.status_code != 200:
        raise Exception(f"API request failed with status {response.status_code}")
        
    return response.json()["data"]["user"]["contributionsCollection"]["contributionCalendar"]["weeks"]

def generate_svg(weeks_data):
    """Calculates coordinates and colors to build the SVG string."""
    # Settings for the SVG grid
    box_size = 10
    box_gap = 4
    svg_width = len(weeks_data) * (box_size + box_gap)
    svg_height = 7 * (box_size + box_gap)
    
    # Map GitHub's contribution levels to specific colors (Dark mode theme)
    color_map = {
        "NONE": "#161b22",
        "FIRST_QUARTILE": "#0e4429",
        "SECOND_QUARTILE": "#006d32",
        "THIRD_QUARTILE": "#26a641",
        "FOURTH_QUARTILE": "#39d353"
    }

    # Initialize SVG container
    svg_content = [
        f'<svg width="{svg_width}" height="{svg_height}" xmlns="http://www.w3.org/2000/svg">',
        f'<rect width="{svg_width}" height="{svg_height}" fill="#0d1117" />' # Background
    ]

    # Generate the grid coordinates using standard algorithmic traversal
    for x, week in enumerate(weeks_data):
        for y, day in enumerate(week["contributionDays"]):
            level = day["contributionLevel"]
            color = color_map.get(level, "#161b22")
            
            x_pos = x * (box_size + box_gap)
            y_pos = y * (box_size + box_gap)
            
            # Append each block
            svg_content.append(
                f'<rect x="{x_pos}" y="{y_pos}" width="{box_size}" height="{box_size}" fill="{color}" rx="2" />'
            )

    svg_content.append("</svg>")
    return "\n".join(svg_content)

def main():
    # GitHub Actions automatically injects this token if configured
    token = os.environ.get("GITHUB_TOKEN")
    
    # Automatically get the username from the repository context (e.g., "username/repo")
    repo_context = os.environ.get("GITHUB_REPOSITORY")
    username = repo_context.split('/')[0] if repo_context else "YOUR_GITHUB_USERNAME"

    if not token:
        print("Error: GITHUB_TOKEN environment variable not set.")
        return

    print(f"Fetching data for {username}...")
    weeks_data = fetch_contribution_data(username, token)
    
    print("Generating SVG...")
    svg_string = generate_svg(weeks_data)
    
    print("Writing to tetris_contributions.svg...")
    with open("tetris_contributions.svg", "w") as f:
        f.write(svg_string)
        
    print("Success!")

if __name__ == "__main__":
    main()
