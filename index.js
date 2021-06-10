const path = require('path');
const fs = require('fs');
const core = require('@actions/core');
const github = require('@actions/github');
const github_token = core.getInput('github-token', {required: true});
const octokit = github.getOctokit(github_token);
const context = github.context;

const version = core.getInput('version', {required: true});
const name = core.getInput('name');
const body_path = core.getInput('body_path');
const prerelease = core.getInput('prerelease');
console.log(`Version: ${version}`);

async function run()
{
	try
	{
		await run_inner();
	}
	catch (error)
	{
		core.setFailed(error.message);
	}
}

async function run_inner()
{
	//Create the tag if it doesn't exist
	var tag_exists = await octokit.paginate(octokit.repos.listTags, { ...context.repo },
	(response, done) => 
	{
		if (response.data.find((tag) => tag.name == version))
		{
			done();
			return true;
		}
		return false;
	})
	.catch(() => { return false });

	if(tag_exists)
	{
		console.log('Tag already exists');
	}
	else
	{
		console.log('Creating tag');
		await octokit.git.createRef(
		{ 
			...context.repo, 
			ref: `refs/tags/${version}`, 
			sha: context.sha 
		});
	}		


	//Create the release if it doesn't exist
	var release = await octokit.repos.getReleaseByTag(
	{
	  ...context.repo,
	  tag: version
	})
	.then(data => { return data })
	.catch(() => { return null });

	if(release)
	{
		console.log('Release already exists');		
	}
	else
	{
		console.log('Creating release');
		release = await octokit.repos.createRelease(
		{
			...context.repo,
			tag_name: version,
			name: name || version,
			target_commitish: context.sha,
			body: fs.readFileSync(path.resolve(__dirname, body_path), "utf-8") || "",
			prerelease: prerelease || false
		});
	}
	
	
	//Upload assets
	const assets = core.getInput('assets');
	if(assets)
	{
		const newAssets = JSON.parse(assets);
		const overwrite = core.getInput('overwrite');
		if(release.data.assets)
		{
			for(var i in release.data.assets)
			{
				var idx = -1;
				for(var j in newAssets)
				{
					if(release.data.assets[i].name == newAssets[j])
					{
						idx = j;
						break;
					}
				}
				if(idx > -1)
				{
					if(overwrite)
					{
						var delResponse = await octokit.repos.deleteReleaseAsset
						({
							...context.repo,
							asset_id: release.data.assets[i].id
						});
					}
					else
					{
						newAssets.splice(idx, 1);
					}
				}
			}
		}
		
		
		
		
		for(var i in newAssets)
		{
			var newAsset = newAssets[i];
			
			console.log(`Uploading: ${newAsset}`);
			
			if (!fs.existsSync(newAsset))
				throw new Error(`${newAssets} file not found`);
			
			var asset = await octokit.repos.uploadReleaseAsset
			({
				url: release.data.upload_url,
				headers: { 'content-type': 'binary/octet-stream', 'content-length': fs.statSync(newAsset).size },
				name: path.basename(newAsset),
				data: fs.readFileSync(newAsset)
			});	
		}		        
    };
	
	
	
	
	
	
}

run();



